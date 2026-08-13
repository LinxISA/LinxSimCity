# Default FA Trace and GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public LinxSimCity Viewer automatically load and play the official FA-250 trace at 1×, while preserving local trace selection and publishing the result at `https://linxisa.github.io/LinxSimCity/`.

**Architecture:** A race-safe player-store load generation owns Worker replacement, while a small default-trace controller owns the static asset fetch and auto-play decision. The React loader hook composes those boundaries and keeps the existing trace parser/Worker unchanged. A dedicated GitHub Pages workflow builds the Vite app with `/LinxSimCity/` as its base and deploys only `apps/viewer/dist`.

**Tech Stack:** TypeScript 5.9, React 19, Zustand 5, Vite 8, Vitest 4, GitHub Actions, GitHub Pages, `.linxtrace` ZIP bundles.

## Global Constraints

- Default asset: `supernpubench-fa-250-blocks.linxtrace`, 124,455 events, 8,987 cycles, 3 chunks, cycles 49–9035.
- Default asset SHA-256: `2d2001de4b1b00e3dade9a8d4e77f5f9915f235798fbbd8b5db1074e65572fa0`.
- Public URL: `https://linxisa.github.io/LinxSimCity/`; deployment base path: `/LinxSimCity/`.
- Successful default loading must call `play()` only after the initial seek completes; playback rate remains the store default of 1×.
- Local file selection always supersedes a pending or loaded default trace and does not force auto-play.
- Default-load errors remain visible and recoverable; no synthetic trace silently replaces the official trace.
- Reuse the existing Worker parser, schema validation, checkpoints, reducer, and WebGL scene; do not add a server or dependency.
- Execute memory-heavy build and browser checks sequentially because this workstation previously exhausted memory during concurrent verification.

---

## File Structure

- `apps/viewer/src/player/types.ts`: expose a success result from `loadTrace` without leaking Worker internals.
- `apps/viewer/src/player/player-store.ts`: make trace loads generation-safe and give each load its own Worker.
- `apps/viewer/src/player/player-store.test.ts`: lock success/failure returns and last-request-wins behavior.
- `apps/viewer/src/loader/default-trace.ts`: resolve the base-aware asset URL and coordinate idempotent fetch/load/play/cancel/retry behavior.
- `apps/viewer/src/loader/default-trace.test.ts`: test URL construction, Strict Mode-style duplicate starts, errors, cancellation, and retry.
- `apps/viewer/src/loader/use-trace-loader.ts`: compose the default controller with Zustand, retry routing, and local file loading.
- `apps/viewer/src/loader/TraceDropzone.tsx`: render the existing full dropzone before load and a persistent compact picker after load.
- `apps/viewer/src/loader/TraceDropzone.test.tsx`: test the compact picker and unchanged extension validation.
- `apps/viewer/src/app/App.tsx`: start the default trace, keep the local picker mounted, and route retry behavior.
- `apps/viewer/src/app/styles.css`: style the compact picker without covering the 3D viewport.
- `apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace`: immutable official FA-250 browser fixture.
- `tests/showcase/default-fa-asset.test.ts`: verify archive presence and SHA-256.
- `apps/viewer/package.json`: add an explicit Pages build script.
- `package.json`: add a sequential Pages artifact verification command.
- `scripts/verify-pages-build.mjs`: verify base-prefixed assets and the copied trace without spawning a nested build from Vitest.
- `tests/pages-deployment.test.ts`: statically verify the Pages scripts and workflow contract.
- `.github/workflows/pages.yml`: official Pages build/artifact/deploy workflow.
- `README.md`: public demo entry point and default workload disclosure.
- `docs/showcase.md`: identify the FA-250 archive as the hosted default demo.

---

### Task 1: Make Player Loads Last-Request-Wins

**Files:**
- Modify: `apps/viewer/src/player/types.ts`
- Modify: `apps/viewer/src/player/player-store.ts`
- Modify: `apps/viewer/src/player/player-store.test.ts`

**Interfaces:**
- Consumes: `TraceWorkerFactory`, `WorkerTraceSource`, and the existing `PlayerStore`.
- Produces: `PlayerState.loadTrace(source: WorkerTraceSource): Promise<boolean>`, where `true` means the load and first-cycle seek became visible and `false` means failure or supersession.

- [ ] **Step 1: Write failing tests for load results and competing loads**

Add a deferred Worker fixture and assertions equivalent to:

```ts
test("the newest trace load owns the visible snapshot", async () => {
  const first = new DeferredLoadWorker(infoAt(49));
  const second = new DeferredLoadWorker(infoAt(200));
  const workers = [first, second];
  const store = createPlayerStore(() => workers.shift()!);

  const defaultLoad = store.getState().loadTrace(defaultSource);
  const localLoad = store.getState().loadTrace(localSource);
  second.finishLoad();
  expect(await localLoad).toBe(true);
  first.finishLoad();
  expect(await defaultLoad).toBe(false);
  expect(store.getState()).toMatchObject({ status: "ready", cycle: 200 });
  expect(first.closed).toBe(true);
});

test("loadTrace reports success and normalized failure", async () => {
  const success = createPlayerStore(() => new FakeWorker());
  expect(await success.getState().loadTrace(source)).toBe(true);

  const failingWorker = new FakeWorker();
  failingWorker.failLoad = true;
  const failure = createPlayerStore(() => failingWorker);
  expect(await failure.getState().loadTrace(source)).toBe(false);
  expect(failure.getState().status).toBe("error");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run apps/viewer/src/player/player-store.test.ts`

Expected: FAIL because `loadTrace` returns `void`, reuses one Worker, and permits an older load to publish late.

- [ ] **Step 3: Implement generation-safe Worker ownership**

Change the public signature and implement the load boundary around a closure-owned generation:

```ts
let worker: ReturnType<TraceWorkerFactory> | undefined;
let loadGeneration = 0;

async loadTrace(source) {
  const generation = ++loadGeneration;
  const previousWorker = worker;
  const nextWorker = createWorker();
  worker = nextWorker;
  await previousWorker?.close();
  set({ status: "loading", diagnostic: undefined, seekPending: true });
  try {
    const info = await nextWorker.load(source);
    if (generation !== loadGeneration || worker !== nextWorker) return false;
    const requestId = get().nextRequestId;
    set({ info, nextRequestId: requestId + 1 });
    const snapshot = await nextWorker.seek(info.manifest.firstCycle, requestId);
    if (generation !== loadGeneration || worker !== nextWorker) return false;
    set({ info, snapshot, cycle: snapshot.cycle, status: "ready", seekPending: false });
    return true;
  } catch (error) {
    if (generation !== loadGeneration || worker !== nextWorker) return false;
    set({ status: "error", seekPending: false, diagnostic: normalizeWorkerError(error) });
    return false;
  }
}
```

Increment `loadGeneration` in `unload()` before closing the current Worker. Do not create a Worker in `seek`, `play`, or an empty Viewer.

- [ ] **Step 4: Run player tests and typecheck**

Run:

```sh
npx vitest run apps/viewer/src/player/player-store.test.ts
npm run typecheck --workspace @linxsimcity/viewer
```

Expected: all player tests PASS and Viewer typecheck exits 0.

- [ ] **Step 5: Commit**

```sh
git add apps/viewer/src/player/types.ts apps/viewer/src/player/player-store.ts apps/viewer/src/player/player-store.test.ts
git commit -m "fix: make viewer trace loads race safe"
```

---

### Task 2: Add the Verified FA-250 Asset and Default Controller

**Files:**
- Create: `apps/viewer/src/loader/default-trace.ts`
- Create: `apps/viewer/src/loader/default-trace.test.ts`
- Create: `apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace`
- Create: `tests/showcase/default-fa-asset.test.ts`

**Interfaces:**
- Consumes: `loadTrace(file: File): Promise<boolean>`, `play(): void`, a base URL, and a fetch-compatible function.
- Produces: `resolveDefaultTraceUrl(baseUrl: string): string` and `createDefaultTraceController(options): DefaultTraceController`, whose `start`, `cancel`, and `retry` methods are idempotent and generation-aware.

- [ ] **Step 1: Write failing controller and asset tests**

Define tests for the public behavior:

```ts
test("resolves the default archive below either viewer base", () => {
  expect(resolveDefaultTraceUrl("/")).toBe(
    "/traces/supernpubench-fa-250-blocks.linxtrace",
  );
  expect(resolveDefaultTraceUrl("/LinxSimCity/")).toBe(
    "/LinxSimCity/traces/supernpubench-fa-250-blocks.linxtrace",
  );
});

test("duplicate starts share one fetch and auto-play once", async () => {
  const fetchTrace = vi.fn(async () => new Response(new Blob(["zip"]), { status: 200 }));
  const loadTrace = vi.fn(async () => true);
  const play = vi.fn();
  const controller = createDefaultTraceController({
    baseUrl: "/LinxSimCity/",
    fetchTrace,
    loadTrace,
    play,
    onFailure: vi.fn(),
  });
  await Promise.all([controller.start(), controller.start()]);
  expect(fetchTrace).toHaveBeenCalledTimes(1);
  expect(loadTrace).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(1);
});

test("a local selection cancels a pending default fetch", async () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((fulfill) => {
      resolve = fulfill;
    });
    return { promise, resolve };
  }
  const response = deferred<Response>();
  const loadTrace = vi.fn(async () => true);
  const play = vi.fn();
  const controller = createDefaultTraceController({
    baseUrl: "/",
    fetchTrace: () => response.promise,
    loadTrace,
    play,
    onFailure: vi.fn(),
  });
  const pending = controller.start();
  controller.cancel();
  response.resolve(new Response(new Blob(["zip"]), { status: 200 }));
  await pending;
  expect(loadTrace).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
});
```

The Node asset test must read the expected public path and compare `createHash("sha256")` against the exact global-constraint hash.

- [ ] **Step 2: Run tests and confirm RED**

Run:

```sh
npx vitest run apps/viewer/src/loader/default-trace.test.ts tests/showcase/default-fa-asset.test.ts
```

Expected: FAIL because the module and public archive do not exist.

- [ ] **Step 3: Copy the immutable official archive and verify it before staging**

Run sequentially:

```sh
mkdir -p apps/viewer/public/traces
cp /Users/zhoubot/Documents/LinxSimCity-showcase/official-supernpubench-20260813/supernpubench-fa-250-blocks.linxtrace apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace
shasum -a 256 apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace
```

Expected SHA-256: `2d2001de4b1b00e3dade9a8d4e77f5f9915f235798fbbd8b5db1074e65572fa0`.

- [ ] **Step 4: Implement the minimal controller**

Use these exact public shapes:

```ts
export const DEFAULT_TRACE_FILENAME = "supernpubench-fa-250-blocks.linxtrace";

export interface DefaultTraceController {
  start(): Promise<boolean>;
  cancel(): void;
  retry(): Promise<boolean>;
}

export function resolveDefaultTraceUrl(baseUrl: string): string;

export function createDefaultTraceController(options: {
  readonly baseUrl: string;
  readonly fetchTrace?: typeof fetch;
  readonly loadTrace: (file: File) => Promise<boolean>;
  readonly play: () => void;
  readonly onFailure: (error?: unknown) => void;
}): DefaultTraceController;
```

`start()` must cache its in-flight promise. It must check its generation after fetch and after `loadTrace`; call `play()` only when `loadTrace` returns `true` and the generation is still current. Reject non-2xx responses with an error containing the HTTP status. `retry()` invalidates the previous generation and starts a fresh request. `cancel()` invalidates the generation without emitting a diagnostic.

- [ ] **Step 5: Run focused tests and Viewer typecheck**

Run:

```sh
npx vitest run apps/viewer/src/loader/default-trace.test.ts tests/showcase/default-fa-asset.test.ts
npm run typecheck --workspace @linxsimcity/viewer
```

Expected: focused tests PASS; the asset hash test proves the copied bytes are unchanged.

- [ ] **Step 6: Commit**

```sh
git add apps/viewer/src/loader/default-trace.ts apps/viewer/src/loader/default-trace.test.ts apps/viewer/public/traces/supernpubench-fa-250-blocks.linxtrace tests/showcase/default-fa-asset.test.ts
git commit -m "feat: bundle the default FA trace"
```

---

### Task 3: Start the Default Demo and Preserve Local Trace Selection

**Files:**
- Modify: `apps/viewer/src/loader/use-trace-loader.ts`
- Modify: `apps/viewer/src/loader/TraceDropzone.tsx`
- Modify: `apps/viewer/src/loader/TraceDropzone.test.tsx`
- Modify: `apps/viewer/src/app/App.tsx`
- Modify: `apps/viewer/src/app/styles.css`
- Create: `apps/viewer/src/app/App.test.tsx`

**Interfaces:**
- Consumes: `DefaultTraceController`, `PlayerState.loadTrace(): Promise<boolean>`, `play()`, `unload()`, and `import.meta.env.BASE_URL`.
- Produces: `useTraceLoader()` fields `loadFile`, `startDefaultTrace`, `retryLoad`, `status`, and `diagnostic`; `TraceDropzone` gains `compact?: boolean`.

- [ ] **Step 1: Write failing UI and integration tests**

Extend the loader test with:

```tsx
test("keeps a compact local trace picker available after loading", () => {
  render(<TraceDropzone onLoad={vi.fn()} status="playing" compact />);
  expect(screen.getByRole("button", { name: /open local trace/i })).toBeTruthy();
  expect(screen.getByLabelText(/choose trace file/i)).toBeTruthy();
  expect(screen.queryByTestId("trace-dropzone")).toBeNull();
});
```

In `App.test.tsx`, mock `SceneViewport` and the loader hook, then assert that mounting calls `startDefaultTrace()` once, a loaded snapshot uses `compact`, and the diagnostics retry callback calls `retryLoad()`.

- [ ] **Step 2: Run the UI tests and confirm RED**

Run:

```sh
npx vitest run apps/viewer/src/loader/TraceDropzone.test.tsx apps/viewer/src/app/App.test.tsx
```

Expected: FAIL because `compact`, default startup, and retry integration do not exist.

- [ ] **Step 3: Compose the controller in `useTraceLoader`**

Create one controller per hook instance with `useRef`. `startDefaultTrace` calls the controller's idempotent `start`. Wrap local loads so they cancel the controller before calling the store:

```ts
const loadFile = useCallback(
  async (file: File) => {
    controller.cancel();
    setDefaultFailure(undefined);
    return loadTrace(file);
  },
  [controller, loadTrace],
);
```

The controller `onFailure` stores a normalized `WorkerDiagnostic` for fetch errors and marks the attempt as a default failure. If the Worker load returns `false`, mark the attempt as a default failure while retaining the store's detailed diagnostic. `retryLoad` calls `unload()` and `controller.retry()` for a default failure; for a local-file failure it only calls `unload()` so the picker returns to its empty state.

- [ ] **Step 4: Integrate startup, retry, and the compact picker**

In `App`, start the controller from an effect:

```tsx
useEffect(() => {
  void startDefaultTrace();
}, [startDefaultTrace]);
```

Always render `TraceDropzone`, passing `compact={Boolean(snapshot)}`. In compact mode render a small top-left button with a hidden file input, not the full drag target. Keep `.linxtrace` extension validation for both modes. Route `DiagnosticsPanel.onRetry` to the hook's `retryLoad`; the hook owns the distinction between default and local failures.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```sh
npx vitest run apps/viewer/src/loader/TraceDropzone.test.tsx apps/viewer/src/app/App.test.tsx apps/viewer/src/player/player-store.test.ts
npm run typecheck --workspace @linxsimcity/viewer
```

Expected: all focused tests PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```sh
git add apps/viewer/src/loader/use-trace-loader.ts apps/viewer/src/loader/TraceDropzone.tsx apps/viewer/src/loader/TraceDropzone.test.tsx apps/viewer/src/app/App.tsx apps/viewer/src/app/App.test.tsx apps/viewer/src/app/styles.css
git commit -m "feat: autoplay the bundled FA demo"
```

---

### Task 4: Build a Base-Path-Correct GitHub Pages Artifact

**Files:**
- Modify: `apps/viewer/package.json`
- Modify: `package.json`
- Create: `scripts/verify-pages-build.mjs`
- Create: `tests/pages-deployment.test.ts`
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: the Viewer workspace build and `apps/viewer/public` assets.
- Produces: `npm run build:pages --workspace @linxsimcity/viewer`, `npm run pages:verify`, and a Pages artifact rooted at `apps/viewer/dist`.

- [ ] **Step 1: Write a failing Pages artifact test**

The test must parse `apps/viewer/package.json`, root `package.json`, and `.github/workflows/pages.yml` and assert:

```ts
expect(viewerPackage.scripts["build:pages"]).toBe(
  "vite build --base=/LinxSimCity/",
);
expect(rootPackage.scripts["pages:verify"]).toContain(
  "scripts/verify-pages-build.mjs",
);
expect(workflow).toContain("actions/configure-pages@v5");
expect(workflow).toContain("actions/upload-pages-artifact@v4");
expect(workflow).toContain("actions/deploy-pages@v4");
```

Also assert the workflow contains `pages: write`, `id-token: write`, and `path: apps/viewer/dist`. Keeping the build outside Vitest prevents the root test pool from running a Vite production build concurrently with other suites.

- [ ] **Step 2: Run the Pages test and confirm RED**

Run: `npx vitest run tests/pages-deployment.test.ts`

Expected: FAIL because `build:pages` and the workflow do not exist.

- [ ] **Step 3: Add the explicit Pages build**

Add these package scripts:

```json
{
  "prebuild:pages": "npm run prebuild",
  "build:pages": "vite build --base=/LinxSimCity/"
}
```

Add the root script:

```json
{
  "pages:verify": "npm run build:pages --workspace @linxsimcity/viewer && node scripts/verify-pages-build.mjs"
}
```

Keep the normal `build` and local `dev` paths rooted at `/`. No conditional production heuristics belong in application code. `scripts/verify-pages-build.mjs` must read `apps/viewer/dist/index.html`, require at least one `/LinxSimCity/assets/` URL, require the built trace path, and verify its SHA-256 against the global constraint.

- [ ] **Step 4: Add the official two-job Pages workflow**

Create `.github/workflows/pages.yml` with:

```yaml
name: Deploy Viewer to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build:pages --workspace @linxsimcity/viewer
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: apps/viewer/dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: Run artifact and workflow tests**

Run sequentially:

```sh
npx vitest run tests/pages-deployment.test.ts
npm run pages:verify
```

Expected: the static workflow test PASS; the sequential build verifier confirms base-prefixed assets and the built trace hash.

- [ ] **Step 6: Commit**

```sh
git add apps/viewer/package.json package.json scripts/verify-pages-build.mjs tests/pages-deployment.test.ts .github/workflows/pages.yml
git commit -m "ci: publish the viewer on GitHub Pages"
```

---

### Task 5: Document and Verify the Complete Local Deliverable

**Files:**
- Modify: `README.md`
- Modify: `docs/showcase.md`

**Interfaces:**
- Consumes: the public URL, default trace metadata, and local Viewer controls.
- Produces: discoverable public-demo documentation that does not overstate the bounded FA workload.

- [ ] **Step 1: Update documentation with exact public behavior**

Add a prominent README link:

```md
## Live demo

Open **[LinxSimCity on GitHub Pages](https://linxisa.github.io/LinxSimCity/)**.
The Viewer loads the verified 250-block SuperNPUBench FlashAttention trace and starts at cycle 49 at 1×. Use **Open local trace** to replace it with another `.linxtrace` bundle.
```

Update `docs/showcase.md` to identify the FA-250 archive as the hosted default and retain the documented reason it is bounded at 250 blocks.

- [ ] **Step 2: Run the complete repository gates sequentially**

Run one command at a time:

```sh
npm run check
npm run build
npm run pages:verify
cmake --build build/sdk --parallel 2
ctest --test-dir build/sdk --output-on-failure
git diff --check
```

Expected: TypeScript typecheck, all Vitest tests, ESLint, Prettier, workspace builds, Pages build, and CTest pass. Keep CMake parallelism at 2 to avoid another memory exhaustion.

- [ ] **Step 3: Run a local browser smoke against the Pages base**

Serve `apps/viewer/dist` at a URL that preserves `/LinxSimCity/`, open it in the browser, and verify:

- the archive request succeeds;
- status becomes `PLAYING` without a click;
- rate is `1×` and cycle advances from 49;
- pause, seek, resume, and `Open local trace` remain usable;
- the console has no uncaught errors.

- [ ] **Step 4: Commit**

```sh
git add README.md docs/showcase.md
git commit -m "docs: link the hosted FA demo"
```

---

### Task 6: Publish and Validate the Public Site

**Files:**
- No source files; this task changes GitHub repository and Pages deployment state.

**Interfaces:**
- Consumes: verified `feat/implementation` HEAD and `.github/workflows/pages.yml`.
- Produces: a fast-forwarded public `main`, a successful `github-pages` deployment, and a browser-verified public URL.

- [ ] **Step 1: Verify the exact publication target**

Run:

```sh
git status --short
git merge-base --is-ancestor origin/main HEAD
gh repo view LinxISA/LinxSimCity --json defaultBranchRef,visibility,url
gh api repos/LinxISA/LinxSimCity/pages || true
```

Expected: worktree clean, `origin/main` is an ancestor, default branch is `main`, and visibility is `PUBLIC`.

- [ ] **Step 2: Configure Pages for workflow deployment**

If `GET /pages` returns 404, run:

```sh
gh api --method POST repos/LinxISA/LinxSimCity/pages -f build_type=workflow
```

If it already exists with another build type, run:

```sh
gh api --method PUT repos/LinxISA/LinxSimCity/pages -f build_type=workflow
```

Then verify `gh api repos/LinxISA/LinxSimCity/pages --jq '.build_type'` prints `workflow`.

- [ ] **Step 3: Push the reviewed implementation and fast-forward `main`**

Run:

```sh
git push origin feat/implementation
git push origin HEAD:main
```

Expected: both refs point to the same verified commit; no force push is used.

- [ ] **Step 4: Wait for CI and Pages deployment**

Run:

```sh
linx_pages_run_id="$(gh run list --repo LinxISA/LinxSimCity --branch main --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
linx_ci_run_id="$(gh run list --repo LinxISA/LinxSimCity --branch main --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$linx_pages_run_id" --repo LinxISA/LinxSimCity --exit-status
gh run watch "$linx_ci_run_id" --repo LinxISA/LinxSimCity --exit-status
```

Expected: both workflows complete successfully.

- [ ] **Step 5: Perform the real public browser acceptance test**

Open `https://linxisa.github.io/LinxSimCity/` and verify the seven acceptance checks from the design: WebGL renders, trace request returns 200, FA metadata appears, status is `PLAYING · 1×`, cycles advance, controls/local picker work, and refresh restarts at cycle 49 without console errors.

- [ ] **Step 6: Record final publication evidence**

Run:

```sh
git rev-parse HEAD
git ls-remote origin refs/heads/main refs/heads/feat/implementation
gh api repos/LinxISA/LinxSimCity/pages --jq '{url: .html_url, status: .status, build_type: .build_type, https_enforced: .https_enforced}'
```

Report the commit, successful Actions runs, archive hash, and verified public URL.
