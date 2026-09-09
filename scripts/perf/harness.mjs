#!/usr/bin/env node
/* global URL, WebSocket, clearTimeout, console, process, setTimeout */
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, freemem, hostname, platform, release, totalmem } from "node:os";
import { extname, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

import { discoverBrowser } from "../visual/harness.mjs";
import {
  generatePerformanceFixture,
  readPerformanceFixtureManifest,
} from "./fixture.mjs";
import { evaluatePerformanceThresholds, summarizeSamples } from "./stats.mjs";

export const PERFORMANCE_REPORT_SCHEMA = "linxsimcity.performance-report";
export const PERFORMANCE_REPORT_VERSION = 1;
export const PERFORMANCE_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
});

/** @type {Readonly<Record<string, string>>} */
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gz": "application/gzip",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
});

/** @param {string} root @param {string} requestPath */
function containedPath(root, requestPath) {
  const target = resolve(root, `.${requestPath}`);
  const child = relative(resolve(root), target);
  if (child === ".." || child.startsWith(`..${sep}`) || child.startsWith("/")) {
    throw new Error(`request path escapes static root: ${requestPath}`);
  }
  return target;
}

/** @param {string} appDirectory @param {string} fixtureDirectory */
async function startServer(appDirectory, fixtureDirectory) {
  try {
    await Promise.all([
      stat(join(appDirectory, "index.html")),
      stat(join(fixtureDirectory, "manifest.json")),
    ]);
  } catch (error) {
    throw new Error(
      `performance page or fixture is missing; expected ${join(appDirectory, "index.html")} and ${join(fixtureDirectory, "manifest.json")}`,
      { cause: error },
    );
  }
  const fixturePrefixes = [
    "/runs/superscalar-matmul.bundle/",
    "/runs/superscalar-matmul-conflict.bundle/",
    "/runs/superscalar-matmul-improved.bundle/",
  ];
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const fixturePrefix = fixturePrefixes.find((prefix) =>
        pathname.startsWith(prefix),
      );
      const root = fixturePrefix ? fixtureDirectory : appDirectory;
      const relativePath = fixturePrefix
        ? pathname.slice(fixturePrefix.length - 1)
        : pathname === "/"
          ? "/index.html"
          : pathname;
      let file = containedPath(root, relativePath);
      try {
        if (!(await stat(file)).isFile()) throw new Error("not a file");
      } catch {
        if (fixturePrefix) {
          response.writeHead(404).end("not found");
          return;
        }
        file = join(appDirectory, "index.html");
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
      });
      createReadStream(file).pipe(response);
    } catch (error) {
      response
        .writeHead(500)
        .end(error instanceof Error ? error.message : String(error));
    }
  });
  await /** @type {Promise<void>} */ (
    new Promise((accept, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => accept());
    })
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("static server has no TCP address");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      /** @type {Promise<void>} */ (
        new Promise((accept, reject) =>
          server.close((error) => (error ? reject(error) : accept())),
        )
      ),
  };
}

class CdpConnection {
  #nextId = 0;
  #pending = new Map();
  /** @param {WebSocket} socket */
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error)
        pending.reject(
          new Error(`${pending.method}: ${message.error.message}`),
        );
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.#pending.values())
        pending.reject(new Error("Chrome DevTools connection closed"));
      this.#pending.clear();
    });
  }
  /** @param {string} method @param {Record<string, unknown>} [params] @param {string} [sessionId] */
  send(method, params = {}, sessionId) {
    const id = ++this.#nextId;
    return new Promise((accept, reject) => {
      this.#pending.set(id, { resolve: accept, reject, method });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }
  close() {
    this.socket.close();
  }
}

/** @param {string} webSocketUrl */
async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((accept, reject) => {
    socket.addEventListener("open", accept, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("cannot connect to Chrome DevTools")),
      { once: true },
    );
  });
  return new CdpConnection(socket);
}

/** @param {string} executable */
function launchChrome(executable) {
  return spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

/** @param {ReturnType<typeof launchChrome>} child */
async function waitForDevTools(child) {
  let stderr = "";
  return await new Promise((accept, reject) => {
    const timeout = setTimeout(
      () =>
        reject(new Error(`Chrome did not expose DevTools: ${stderr.trim()}`)),
      15_000,
    );
    const cleanup = () => {
      clearTimeout(timeout);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    /** @param {Buffer} chunk */
    const onData = (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) {
        cleanup();
        accept(match[1]);
      }
    };
    /** @param {number | null} code */
    const onExit = (code) => {
      cleanup();
      reject(
        new Error(
          `Chrome exited before DevTools was ready (${String(code)}): ${stderr.trim()}`,
        ),
      );
    };
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

/** @param {CdpConnection} cdp @param {string} sessionId @param {string} expression */
async function evaluate(cdp, sessionId, expression) {
  const value = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture: true },
    sessionId,
  );
  if (value.exceptionDetails)
    throw new Error(
      `browser evaluation failed: ${value.exceptionDetails.text}`,
    );
  return value.result?.value;
}

/** @param {CdpConnection} cdp @param {string} sessionId @param {string} expression @param {string} description */
async function waitFor(cdp, sessionId, expression, description) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, sessionId, `Boolean(${expression})`)) return;
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error(`performance page timed out waiting for ${description}`);
}

/** @param {unknown} value */
export function validatePerformanceReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("performance report must be an object");
  const report = /** @type {Record<string, any>} */ (value);
  if (
    report.schema !== PERFORMANCE_REPORT_SCHEMA ||
    report.version !== PERFORMANCE_REPORT_VERSION
  ) {
    throw new Error("unsupported performance report schema");
  }
  if (!/^[a-f0-9]{64}$/u.test(report.fixture?.hash ?? ""))
    throw new Error("performance report requires fixture SHA-256");
  if (
    report.viewport?.width !== 1440 ||
    report.viewport?.height !== 900 ||
    report.viewport?.deviceScaleFactor !== 1
  ) {
    throw new Error("performance report viewport must be 1440x900 DPR1");
  }
  if (
    !Array.isArray(report.rawSamples?.frameDurationMs) ||
    !Array.isArray(report.rawSamples?.warmSeekMs)
  ) {
    throw new Error("performance report requires raw frame and seek samples");
  }
  if (report.rawSamples.warmSeekMs.length !== 100)
    throw new Error("performance report requires 100 warm seek samples");
  return value;
}

/** @param {{ appDirectory: string, fixtureDirectory: string, output: string, durationSeconds: number, soakMinutes: number, chromeBin: string | undefined }} options */
export async function runPerformanceHarness(options) {
  if (!(options.durationSeconds > 0) || !(options.soakMinutes >= 0))
    throw new RangeError("duration and soak values are invalid");
  const fixture = await readPerformanceFixtureManifest(
    options.fixtureDirectory,
  );
  const server = await startServer(
    resolve(options.appDirectory),
    resolve(options.fixtureDirectory),
  );
  const executable = await discoverBrowser(options.chromeBin);
  const child = launchChrome(executable);
  let cdp;
  try {
    cdp = await connectCdp(await waitForDevTools(child));
    const browser = await cdp.send("Browser.getVersion");
    const { targetId } = await cdp.send("Target.createTarget", {
      url: server.url,
    });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await Promise.all([
      cdp.send("Page.enable", {}, sessionId),
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Performance.enable", {}, sessionId),
    ]);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { ...PERFORMANCE_VIEWPORT, mobile: false },
      sessionId,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('canvas') && document.querySelector('[aria-label="Current topology identity"]')?.textContent?.includes('拓扑有效')`,
      "the WebGL scene",
    );
    const clicked = await evaluate(
      cdp,
      sessionId,
      `(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('载入录制回放')); if (!button) return false; button.click(); return true; })()`,
    );
    if (!clicked)
      throw new Error(
        "performance page does not expose the recorded-run load action",
      );
    await waitFor(
      cdp,
      sessionId,
      `document.body.innerText.includes('1000000 个真实事件') && document.querySelector('[aria-label="Trace playback controls"]')`,
      "the million-event current bundle",
    );
    const frameResult =
      /** @type {{ frames: number[], longTasks: { startTimeMs: number, durationMs: number }[], elapsedMs: number }} */ (
        await evaluate(
          cdp,
          sessionId,
          `new Promise((resolve, reject) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) { reject(new Error('WebGL canvas disappeared')); return; }
        const durationMs = ${JSON.stringify(options.durationSeconds * 1_000)};
        const frames = [];
        const longTasks = [];
        const observer = typeof PerformanceObserver === 'function'
          ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => ({ startTimeMs: entry.startTime, durationMs: entry.duration }))))
          : undefined;
        try { observer?.observe({ type: 'longtask', buffered: true }); } catch {}
        const box = canvas.getBoundingClientRect();
        const start = performance.now();
        let previous;
        let interactionStep = -1;
        const tick = (now) => {
          if (previous !== undefined) frames.push(now - previous);
          previous = now;
          const elapsed = now - start;
          const nextStep = Math.floor(elapsed / 1000);
          if (nextStep !== interactionStep) {
            interactionStep = nextStep;
            const angle = nextStep * 0.37;
            const x = box.left + box.width * (0.5 + Math.cos(angle) * 0.22);
            const y = box.top + box.height * (0.5 + Math.sin(angle) * 0.18);
            canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1, buttons: 1 }));
            canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 18, clientY: y + 9, pointerId: 1, buttons: 1 }));
            canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + 18, clientY: y + 9, pointerId: 1 }));
            canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: nextStep % 2 === 0 ? -24 : 24 }));
          }
          if (elapsed < durationMs) requestAnimationFrame(tick);
          else { observer?.disconnect(); resolve({ frames, longTasks, elapsedMs: elapsed }); }
        };
        requestAnimationFrame(tick);
      })`,
        )
      );
    const seekSamples = /** @type {number[]} */ (
      await evaluate(
        cdp,
        sessionId,
        `new Promise(async (resolve, reject) => {
        const input = document.querySelector('[aria-label="Trace playback controls"] input');
        if (!(input instanceof HTMLInputElement)) { reject(new Error('trace Cycle input is missing')); return; }
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const samples = [];
        for (let index = 0; index < 100; index += 1) {
          const cycle = String((index * 7919 + 104729) % 1000000);
          const start = performance.now();
          setter.call(input, cycle);
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: cycle }));
          input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
          const deadline = performance.now() + 10000;
          while (!document.body.innerText.includes('core cycle ' + cycle)) {
            if (performance.now() > deadline) { reject(new Error('seek did not complete at cycle ' + cycle)); return; }
            await new Promise((accept) => requestAnimationFrame(accept));
          }
          await new Promise((accept) => requestAnimationFrame(() => requestAnimationFrame(accept)));
          samples.push(performance.now() - start);
        }
        resolve(samples);
      })`,
      )
    );
    let soak;
    if (options.soakMinutes > 0) {
      soak = await evaluate(
        cdp,
        sessionId,
        `new Promise((resolve) => { const samples = []; const end = performance.now() + ${JSON.stringify(options.soakMinutes * 60_000)}; let previous; const tick = (now) => { if (previous !== undefined) samples.push(now - previous); previous = now; if (now < end) requestAnimationFrame(tick); else resolve(samples); }; requestAnimationFrame(tick); })`,
      );
    }
    const performanceMetrics =
      /** @type {{ metrics: { name: string, value: number }[] }} */ (
        await cdp.send("Performance.getMetrics", {}, sessionId)
      );
    const domCounters = await cdp.send("Memory.getDOMCounters", {}, sessionId);
    const processInfo =
      /** @type {{ processInfo: { type: string, id: number, cpuTime: number }[] }} */ (
        await cdp.send("SystemInfo.getProcessInfo")
      );
    const machine = {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpuModel: cpus()[0]?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtReport: freemem(),
    };
    const frame = summarizeSamples(frameResult.frames);
    const seek = summarizeSamples(seekSamples);
    const thresholds = evaluatePerformanceThresholds({ frame, seek });
    const report = {
      schema: PERFORMANCE_REPORT_SCHEMA,
      version: PERFORMANCE_REPORT_VERSION,
      generatedAt: new Date().toISOString(),
      machine,
      browser: {
        product: browser.product,
        revision: browser.revision,
        userAgent: browser.userAgent,
        executable,
      },
      viewport: PERFORMANCE_VIEWPORT,
      fixture: { hash: fixture.fixtureHash, manifest: fixture },
      run: {
        durationSeconds: options.durationSeconds,
        warmSeekCount: 100,
        soakMinutes: options.soakMinutes,
        interactionPath:
          "one deterministic orbit drag and alternating zoom step per second",
      },
      metrics: {
        frameDuration: frame,
        warmSeek: seek,
        longTasks: {
          count: frameResult.longTasks.length,
          totalDurationMs: frameResult.longTasks.reduce(
            (sum, task) => sum + task.durationMs,
            0,
          ),
        },
        cdpPerformance: Object.fromEntries(
          performanceMetrics.metrics.map((metric) => [
            metric.name,
            metric.value,
          ]),
        ),
        domCounters,
        rendererProcesses: processInfo.processInfo.filter(
          (item) => item.type === "renderer",
        ),
        ...(soak ? { soakFrameDuration: summarizeSamples(soak) } : {}),
      },
      thresholds,
      rawSamples: {
        frameDurationMs: frameResult.frames,
        warmSeekMs: seekSamples,
        longTasks: frameResult.longTasks,
        ...(soak ? { soakFrameDurationMs: soak } : {}),
      },
    };
    validatePerformanceReport(report);
    await mkdir(resolve(options.output, ".."), { recursive: true });
    await writeFile(
      resolve(options.output),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  } finally {
    cdp?.close();
    child.kill("SIGTERM");
    await server.close();
  }
}

/** @param {string[]} arguments_ */
function parseArguments(arguments_) {
  /** @type {{ appDirectory: string, fixtureDirectory: string, output: string, durationSeconds: number, soakMinutes: number, chromeBin: string | undefined, generate: boolean }} */
  const options = {
    appDirectory: "apps/game/dist",
    fixtureDirectory: "build/perf/m8-large.bundle",
    output: "build/perf/m8-report.json",
    durationSeconds: 60,
    soakMinutes: 0,
    chromeBin: undefined,
    generate: true,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const next = () => {
      const value = arguments_[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      return value;
    };
    if (argument === "--app-dir") options.appDirectory = next();
    else if (argument === "--fixture") options.fixtureDirectory = next();
    else if (argument === "--output") options.output = next();
    else if (argument === "--duration")
      options.durationSeconds = Number(next());
    else if (argument === "--soak-minutes")
      options.soakMinutes = Number(next());
    else if (argument === "--chrome-bin") options.chromeBin = next();
    else if (argument === "--no-generate") options.generate = false;
    else throw new Error(`unknown performance option: ${argument}`);
  }
  return options;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  const options = parseArguments(process.argv.slice(2));
  if (options.generate)
    await generatePerformanceFixture(options.fixtureDirectory);
  const report = await runPerformanceHarness(options);
  console.log(
    JSON.stringify(
      { output: resolve(options.output), thresholds: report.thresholds },
      null,
      2,
    ),
  );
  if (!report.thresholds.pass) process.exitCode = 1;
}
