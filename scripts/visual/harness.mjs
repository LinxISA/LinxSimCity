/* global Buffer, URL, WebSocket, clearTimeout, console, process, setTimeout */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VISUAL_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
});

export const REQUIRED_CAPTURES = Object.freeze([
  Object.freeze({
    id: "overview",
    file: "01-overview.png",
    description: "Topology-generated chip-city overview",
  }),
  Object.freeze({
    id: "h3-expanded",
    file: "02-h3-expanded.png",
    description: "Expanded DavinciOO H3 catalog hierarchy",
  }),
  Object.freeze({
    id: "selected-inspector",
    file: "03-selected-inspector.png",
    description: "Selected topology node with the inspector populated",
  }),
  Object.freeze({
    id: "bank-conflict-run",
    file: "04-bank-conflict-run.png",
    description:
      "Recorded bank-conflict bundle loaded at its declared initial cycle",
  }),
]);

const COMMON_BROWSER_PATHS = Object.freeze([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
]);

/** @typedef {{ id: string, file: string, description: string }} CaptureDefinition */
/** @typedef {{ url: string, outputDirectory: string, chromeBin: string | undefined }} CaptureOptions */

/** @param {Buffer} bytes */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** @param {Buffer} bytes */
export function readPngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error("file is not a PNG");
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("PNG does not start with an IHDR chunk");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error("PNG has an empty image dimension");
  }
  return { width, height };
}

/** @param {unknown} value @param {string} label @returns {Record<string, any>} */
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

/** @param {string} directory @param {string} file */
function resolveContainedFile(directory, file) {
  if (isAbsolute(file))
    throw new Error(`capture path must be relative: ${file}`);
  const target = resolve(directory, file);
  const pathFromDirectory = relative(resolve(directory), target);
  if (pathFromDirectory.startsWith("..") || isAbsolute(pathFromDirectory)) {
    throw new Error(`capture path escapes evidence directory: ${file}`);
  }
  return target;
}

/** @param {string} directory */
export async function checkEvidenceDirectory(directory) {
  const evidenceDirectory = resolve(directory);
  const manifestPath = join(evidenceDirectory, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot read visual manifest ${manifestPath}`, {
      cause: error,
    });
  }

  assertPlainObject(manifest, "manifest");
  if (manifest.schema !== "linxsimcity.visual-evidence") {
    throw new Error(
      `unsupported visual manifest schema: ${String(manifest.schema)}`,
    );
  }
  if (manifest.version !== 1) {
    throw new Error(
      `unsupported visual manifest version: ${String(manifest.version)}`,
    );
  }
  assertString(manifest.generatedAt, "manifest.generatedAt");
  assertString(manifest.url, "manifest.url");
  new URL(manifest.url);
  const browser = assertPlainObject(manifest.browser, "manifest.browser");
  assertString(browser.product, "manifest.browser.product");
  assertString(browser.executable, "manifest.browser.executable");
  const viewport = assertPlainObject(manifest.viewport, "manifest.viewport");
  for (const [key, expected] of Object.entries(VISUAL_VIEWPORT)) {
    if (viewport[key] !== expected) {
      throw new Error(
        `manifest viewport ${key} must be ${expected}, got ${String(viewport[key])}`,
      );
    }
  }
  if (!Array.isArray(manifest.captures)) {
    throw new Error("manifest.captures must be an array");
  }
  if (manifest.captures.length !== REQUIRED_CAPTURES.length) {
    throw new Error(
      `visual manifest must contain ${REQUIRED_CAPTURES.length} captures`,
    );
  }

  const capturesById = new Map(
    manifest.captures.map(
      /** @param {Record<string, any>} capture */ (capture) => [
        capture.id,
        capture,
      ],
    ),
  );
  const checkedCaptures = [];
  for (const required of REQUIRED_CAPTURES) {
    const capture = assertPlainObject(
      capturesById.get(required.id),
      `capture ${required.id}`,
    );
    if (capture.file !== required.file) {
      throw new Error(`capture ${required.id} must use ${required.file}`);
    }
    assertString(capture.description, `capture ${required.id}.description`);
    assertString(capture.step, `capture ${required.id}.step`);
    if (!/^[a-f0-9]{64}$/.test(capture.sha256 ?? "")) {
      throw new Error(
        `capture ${required.id}.sha256 must be lowercase SHA-256`,
      );
    }
    const bytes = await readFile(
      resolveContainedFile(evidenceDirectory, capture.file),
    );
    const dimensions = readPngDimensions(bytes);
    if (
      dimensions.width !== VISUAL_VIEWPORT.width ||
      dimensions.height !== VISUAL_VIEWPORT.height
    ) {
      throw new Error(
        `capture ${required.id} is ${dimensions.width}x${dimensions.height}; expected ${VISUAL_VIEWPORT.width}x${VISUAL_VIEWPORT.height}`,
      );
    }
    if (
      capture.width !== dimensions.width ||
      capture.height !== dimensions.height
    ) {
      throw new Error(
        `capture ${required.id} dimensions do not match its PNG IHDR`,
      );
    }
    const digest = sha256(bytes);
    if (capture.sha256 !== digest) {
      throw new Error(`capture ${required.id} SHA-256 mismatch`);
    }
    checkedCaptures.push({
      id: required.id,
      file: capture.file,
      sha256: digest,
      ...dimensions,
    });
  }

  return { manifestPath, captures: checkedCaptures };
}

/** @param {string | undefined} [explicitPath] */
export async function discoverBrowser(explicitPath = process.env.CHROME_BIN) {
  const candidates = explicitPath ? [explicitPath] : COMMON_BROWSER_PATHS;
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return resolve(candidate);
    } catch {
      // Continue through the deterministic candidate list.
    }
  }
  const source = explicitPath
    ? `CHROME_BIN=${explicitPath}`
    : COMMON_BROWSER_PATHS.join(", ");
  throw new Error(
    `Chrome/Chromium executable not found or not executable. Checked: ${source}`,
  );
}

class CdpConnection {
  #nextId = 0;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (reason?: unknown) => void, method: string }>} */
  #pending = new Map();
  /** @type {WebSocket} */
  #socket;

  /** @param {WebSocket} socket */
  constructor(socket) {
    this.#socket = socket;
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
      for (const pending of this.#pending.values()) {
        pending.reject(new Error("Chrome DevTools connection closed"));
      }
      this.#pending.clear();
    });
  }

  /**
   * @param {string} method
   * @param {Record<string, any>} [params]
   * @param {string} [sessionId]
   * @returns {Promise<any>}
   */
  send(method, params = {}, sessionId) {
    const id = ++this.#nextId;
    return new Promise((resolvePromise, reject) => {
      this.#pending.set(id, { resolve: resolvePromise, reject, method });
      this.#socket.send(
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
    this.#socket.close();
  }
}

/** @param {string} webSocketUrl */
async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("cannot connect to Chrome DevTools")),
      {
        once: true,
      },
    );
  });
  return new CdpConnection(socket);
}

/** @param {string} executable */
function launchBrowser(executable) {
  const child = spawn(
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
  return child;
}

/** @param {ReturnType<typeof launchBrowser>} child @param {number} [timeoutMs] */
async function waitForDevTools(child, timeoutMs = 15_000) {
  let stderr = "";
  return await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Chrome did not expose DevTools within ${timeoutMs}ms. stderr: ${stderr.trim()}`,
        ),
      );
    }, timeoutMs);
    /** @param {Error | undefined} error @param {string | undefined} [value] */
    const finish = (error, value) => {
      clearTimeout(timeout);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolvePromise(value);
    };
    /** @param {Buffer} chunk */
    const onData = (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) finish(undefined, match[1]);
    };
    /** @param {number | null} code @param {NodeJS.Signals | null} signal */
    const onExit = (code, signal) => {
      finish(
        new Error(
          `Chrome exited before DevTools was ready (code ${String(code)}, signal ${String(signal)}). stderr: ${stderr.trim()}`,
        ),
      );
    };
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

/** @param {CdpConnection} cdp @param {string} sessionId @param {string} expression */
async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(
      `browser evaluation failed: ${result.exceptionDetails.text}`,
    );
  }
  return result.result?.value;
}

/**
 * @param {CdpConnection} cdp
 * @param {string} sessionId
 * @param {string} expression
 * @param {string} description
 * @param {number} [timeoutMs]
 */
async function waitFor(
  cdp,
  sessionId,
  expression,
  description,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, sessionId, `Boolean(${expression})`)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for ${description}`);
}

/** @param {CdpConnection} cdp @param {string} sessionId @param {string} selector @param {string} text */
async function clickMatching(cdp, sessionId, selector, text) {
  const expression = `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((candidate) => candidate.textContent?.includes(${JSON.stringify(text)}));
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  })()`;
  if (!(await evaluate(cdp, sessionId, expression))) {
    throw new Error(
      `cannot find ${selector} containing ${JSON.stringify(text)}`,
    );
  }
}

/** @param {CdpConnection} cdp @param {string} sessionId */
async function settle(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250))))`,
  );
}

/**
 * @param {CdpConnection} cdp
 * @param {string} sessionId
 * @param {string} outputDirectory
 * @param {CaptureDefinition} captureDefinition
 * @param {string} step
 */
async function capture(
  cdp,
  sessionId,
  outputDirectory,
  captureDefinition,
  step,
) {
  await settle(cdp, sessionId);
  const result = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true, captureBeyondViewport: false },
    sessionId,
  );
  const bytes = Buffer.from(result.data, "base64");
  const dimensions = readPngDimensions(bytes);
  if (
    dimensions.width !== VISUAL_VIEWPORT.width ||
    dimensions.height !== VISUAL_VIEWPORT.height
  ) {
    throw new Error(
      `Chrome captured ${dimensions.width}x${dimensions.height}; expected 1440x900`,
    );
  }
  await writeFile(join(outputDirectory, captureDefinition.file), bytes);
  return {
    ...captureDefinition,
    step,
    ...dimensions,
    sha256: sha256(bytes),
  };
}

/** @param {CaptureOptions} options */
export async function captureVisualEvidence({
  url,
  outputDirectory,
  chromeBin,
}) {
  const targetUrl = new URL(url).href;
  const evidenceDirectory = resolve(outputDirectory);
  const executable = await discoverBrowser(chromeBin);
  await mkdir(evidenceDirectory, { recursive: true });
  const child = launchBrowser(executable);
  let cdp;
  try {
    const webSocketUrl = await waitForDevTools(child);
    cdp = await connectCdp(webSocketUrl);
    const browser = await cdp.send("Browser.getVersion");
    const { targetId } = await cdp.send("Target.createTarget", {
      url: targetUrl,
    });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: VISUAL_VIEWPORT.width,
        height: VISUAL_VIEWPORT.height,
        deviceScaleFactor: VISUAL_VIEWPORT.deviceScaleFactor,
        mobile: false,
      },
      sessionId,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('canvas') && document.querySelector('[aria-label="Current topology identity"]')?.textContent?.includes('拓扑有效')`,
      "a valid topology and WebGL canvas",
    );

    const [
      overviewCapture,
      hierarchyCapture,
      inspectorCapture,
      conflictCapture,
    ] =
      /** @type {readonly [CaptureDefinition, CaptureDefinition, CaptureDefinition, CaptureDefinition]} */ (
        REQUIRED_CAPTURES
      );
    const captures = [];
    captures.push(
      await capture(
        cdp,
        sessionId,
        evidenceDirectory,
        overviewCapture,
        "Wait for a valid topology and WebGL canvas",
      ),
    );

    await clickMatching(cdp, sessionId, '[role="tab"]', "H3 目录");
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('.catalog-h1')`,
      "the H3 catalog",
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('.catalog-h1')?.click()`,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('.catalog-h2')`,
      "an expanded H1 branch",
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('.catalog-h2')?.click()`,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('.catalog-node')`,
      "an expanded H2 branch",
    );
    captures.push(
      await capture(
        cdp,
        sessionId,
        evidenceDirectory,
        hierarchyCapture,
        "Open H3 catalog, first H1 branch, and first H2 branch",
      ),
    );

    await clickMatching(cdp, sessionId, '[role="tab"]', "运行拓扑");
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('.topology-panel h1')?.textContent?.includes('拓扑顺序') && document.querySelector('.topology-node')`,
      "topology tree",
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('.topology-node')?.click()`,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('[aria-label="拓扑节点检查器"] h2')?.textContent !== '未选择对象'`,
      "selected topology inspector",
    );
    captures.push(
      await capture(
        cdp,
        sessionId,
        evidenceDirectory,
        inspectorCapture,
        "Select the first visible node in the topology tree",
      ),
    );

    await evaluate(
      cdp,
      sessionId,
      `(() => {
      const select = document.querySelector('.recorded-run-picker select');
      if (!(select instanceof HTMLSelectElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'bank-conflict');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('.recorded-run-picker select')?.value === 'bank-conflict'`,
      "bank-conflict run selection",
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('.run-button')?.click()`,
    );
    await waitFor(
      cdp,
      sessionId,
      `document.querySelector('.scene-state-legend small')?.textContent?.includes('BANK CONFLICT') && document.querySelector('.trace-playback')`,
      "bank-conflict trace playback",
      60_000,
    );
    captures.push(
      await capture(
        cdp,
        sessionId,
        evidenceDirectory,
        conflictCapture,
        "Select Bank Conflict and load its recorded trace bundle",
      ),
    );

    const manifest = {
      schema: "linxsimcity.visual-evidence",
      version: 1,
      generatedAt: new Date().toISOString(),
      url: targetUrl,
      viewport: VISUAL_VIEWPORT,
      browser: {
        product: browser.product,
        revision: browser.revision,
        protocolVersion: browser.protocolVersion,
        userAgent: browser.userAgent,
        executable,
      },
      captures,
    };
    await writeFile(
      join(evidenceDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await checkEvidenceDirectory(evidenceDirectory);
    return manifest;
  } finally {
    cdp?.close();
    if (!child.killed) child.kill("SIGTERM");
  }
}

/** @param {string[]} argv */
function parseCliArguments(argv) {
  /** @type {{ check: boolean, url: string, outputDirectory: string, chromeBin: string | undefined }} */
  const options = {
    check: false,
    url: "http://127.0.0.1:5173/",
    outputDirectory: resolve("build/visual-evidence"),
    chromeBin: undefined,
  };
  /** @param {number} index @param {string} option */
  const valueAfter = (index, option) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${option} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      const directory = argv[index + 1];
      if (directory && !directory.startsWith("--")) {
        options.outputDirectory = resolve(directory);
        index += 1;
      }
    } else if (argument === "--url") {
      options.url = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--output") {
      options.outputDirectory = resolve(valueAfter(index, argument));
      index += 1;
    } else if (argument === "--chrome-bin") {
      options.chromeBin = valueAfter(index, argument);
      index += 1;
    } else throw new Error(`unknown visual harness argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  if (options.check) {
    const result = await checkEvidenceDirectory(options.outputDirectory);
    console.log(
      `Visual evidence valid: ${result.captures.length} captures at ${dirname(result.manifestPath)}`,
    );
    return;
  }
  const manifest = await captureVisualEvidence(options);
  console.log(
    `Captured ${manifest.captures.length} visual baselines in ${options.outputDirectory}`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Visual harness failed: ${error.message}`);
    process.exitCode = 1;
  });
}
