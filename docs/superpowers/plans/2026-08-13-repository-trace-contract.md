# LinxSimCity Repository Foundation and Trace Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `LinxISA/LinxSimCity` and deliver a tested, versioned trace contract, C++ writer SDK, CLI, and deterministic synthetic fixtures.

**Architecture:** An npm-workspace monorepo owns TypeScript contract packages and CLI tooling, while `sdk/cpp` exposes a dependency-light C++17 `TraceSink`. The SDK writes the logical bundle directory; the CLI validates, indexes, inspects, and packs that directory into a ZIP-based `.linxtrace` file.

**Tech Stack:** Node.js 22.12+, npm workspaces, TypeScript 7.0.2, Zod 4.4.3, Commander 15.0.0, fflate 0.8.3, Vitest 4.1.10, CMake 3.20+, C++17, RapidJSON, GitHub Actions.

## Global Constraints

- Repository visibility is public and the target is `LinxISA/LinxSimCity`.
- Schema version starts at `1.0.0`; incompatible changes increment major.
- Default chunk span is exactly 4096 cycles and is recorded in `manifest.json`.
- `.linxtrace` is a standard ZIP container; pre-gzipped chunks use ZIP store mode.
- `(cycle, seq)` is strictly increasing and every `entity_id` resolves in topology.
- The C++ SDK has no dependency on Three.js, React, Node.js, or viewer code.
- Writer output contains hardware semantics and topology placement hints, never animation coordinates.
- Use TDD, keep commits task-scoped, and do not start viewer implementation in this plan.

---

## File Structure

```text
package.json                         npm workspace and root scripts
package-lock.json                    locked JavaScript dependencies
.nvmrc                               Node 22
tsconfig.base.json                   shared strict TypeScript settings
vitest.workspace.ts                 package test discovery
.github/workflows/ci.yml             TypeScript and C++ gates
packages/trace-schema/               canonical TS schema and JSON Schema export
packages/topology/                   stable IDs and topology validation
sdk/cpp/                             C++ TraceSink and logical-bundle writer
tools/linxtrace/                     validate/index/pack/inspect CLI
fixtures/synthetic/                  deterministic valid bundles
fixtures/malformed/                  one-error-per-fixture invalid bundles
tests/contract/                      C++ writer to TS reader compatibility
docs/trace-format/                   public contract documentation
```

### Task 1: Workspace, CI, and GitHub Repository

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Produces: root commands `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run check`.
- Produces: npm workspaces `apps/*`, `packages/*`, `tools/*`.

- [ ] **Step 1: Prove the workspace is not scaffolded**

Run:

```bash
test -f package.json
```

Expected: FAIL with exit code 1.

- [ ] **Step 2: Add the root workspace files**

Create `package.json` with these exact scripts and version floors:

```json
{
  "name": "linxsimcity",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "workspaces": ["apps/*", "packages/*", "tools/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "check": "npm run typecheck && npm test && npm run lint && npm run format:check"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "eslint": "10.8.1",
    "prettier": "3.9.6",
    "tsx": "4.23.12",
    "typescript": "7.0.2",
    "typescript-eslint": "8.67.0",
    "vitest": "4.1.10"
  }
}
```

Set `.nvmrc` to `22`. Set `tsconfig.base.json` to `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `module: NodeNext`, and `target: ES2023`. Configure Vitest to include `packages/**/*.test.ts`, `tools/**/*.test.ts`, and `tests/**/*.test.ts`.

- [ ] **Step 3: Add repository hygiene and CI**

Ignore `node_modules/`, `dist/`, `build/`, `coverage/`, `*.linxtrace`, and `.DS_Store`. Add a CI matrix with:

```yaml
jobs:
  typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check
  cpp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
      - run: cmake --build build/sdk --parallel
      - run: ctest --test-dir build/sdk --output-on-failure
```

- [ ] **Step 4: Install and run the empty workspace gates**

Run:

```bash
npm install
npm run check
```

Expected: PASS with zero tests and no lint/type errors.

- [ ] **Step 5: Publish the local repository to the organization**

Run:

```bash
if gh repo view LinxISA/LinxSimCity >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin git@github.com:LinxISA/LinxSimCity.git
  git push -u origin main
else
  gh repo create LinxISA/LinxSimCity --public --source=. --remote=origin --push
fi
```

Expected: `gh repo view LinxISA/LinxSimCity --json visibility -q .visibility` prints `PUBLIC`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .nvmrc tsconfig.base.json vitest.workspace.ts .gitignore .github/workflows/ci.yml README.md
git commit -m "chore: scaffold LinxSimCity workspace"
git push
```

### Task 2: Canonical Trace Schema

**Files:**
- Create: `packages/trace-schema/package.json`
- Create: `packages/trace-schema/tsconfig.json`
- Create: `packages/trace-schema/src/types.ts`
- Create: `packages/trace-schema/src/schemas.ts`
- Create: `packages/trace-schema/src/compatibility.ts`
- Create: `packages/trace-schema/src/export-json-schema.ts`
- Create: `packages/trace-schema/src/index.ts`
- Test: `packages/trace-schema/src/schemas.test.ts`
- Create: `packages/trace-schema/schema/linxtrace-v1.schema.json`

**Interfaces:**
- Produces: `TraceManifest`, `EventEnvelope`, `TraceEventType`, `TraceProfile`, `TraceIndex`, `ChunkIndexEntry`, `CheckpointState`.
- Produces: `parseManifest(value)`, `parseEvent(value)`, `parseIndex(value)`, `assertCompatibleVersion(version)`.
- Consumes: no other workspace package.

- [ ] **Step 1: Write failing schema tests**

Cover strict ordering fields, the three profiles, invalid major versions, and payload discrimination:

```ts
expect(parseEvent({ cycle: 7, seq: 2, type: 'cell.read', scope: 'pe0', entity_id: 'pe0.bg.bank0.row3', payload: { request_id: 9, source: 'cube', bytes: 128, result: 'grant' } }).type).toBe('cell.read');
expect(() => assertCompatibleVersion('2.0.0')).toThrow(/unsupported schema major/);
expect(() => parseEvent({ cycle: -1, seq: 0, type: 'cell.read', scope: 'pe0', entity_id: 'x', payload: {} })).toThrow();
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/trace-schema/src/schemas.test.ts`

Expected: FAIL because `parseEvent` and types do not exist.

- [ ] **Step 3: Define exact contract types**

Define:

```ts
export type TraceProfile = 'overview' | 'pipeline' | 'forensic';
export interface EventEnvelope<T extends TraceEventType = TraceEventType, P = unknown> {
  cycle: number;
  seq: number;
  type: T;
  scope: string;
  entity_id: string;
  payload: P;
}
export interface ChunkIndexEntry {
  path: string;
  firstCycle: number;
  lastCycle: number;
  eventCount: number;
  compressedBytes: number;
  sha256: string;
  checkpointPath: string;
}
```

Declare every event category from the design spec as a literal union. Build a Zod discriminated union for payload-bearing events and a strict base schema for the envelope. Use safe integers for `cycle` and `seq`.

- [ ] **Step 4: Implement version compatibility and JSON Schema export**

`assertCompatibleVersion` accepts major 1 and rejects other majors. Export a single JSON Schema document with `$id` equal to `https://linxisa.github.io/LinxSimCity/schema/linxtrace-v1.schema.json`.

- [ ] **Step 5: Run tests and export schema**

Run:

```bash
npx vitest run packages/trace-schema/src/schemas.test.ts
npm run build -w @linxsimcity/trace-schema
node packages/trace-schema/dist/export-json-schema.js
```

Expected: PASS; `schema/linxtrace-v1.schema.json` parses as JSON.

- [ ] **Step 6: Commit**

```bash
git add packages/trace-schema
git commit -m "feat: define Linx trace schema v1"
```

### Task 3: Topology Descriptor and Stable Entity IDs

**Files:**
- Create: `packages/topology/package.json`
- Create: `packages/topology/tsconfig.json`
- Create: `packages/topology/src/types.ts`
- Create: `packages/topology/src/entity-id.ts`
- Create: `packages/topology/src/validate.ts`
- Create: `packages/topology/src/index.ts`
- Test: `packages/topology/src/entity-id.test.ts`
- Test: `packages/topology/src/validate.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope` from `@linxsimcity/trace-schema`.
- Produces: `TopologyDescriptor`, `TopologyEntity`, `TopologyPort`, `formatEntityId(parts)`, `validateTopology(topology)`, `validateEventReferences(topology, events)`.

- [ ] **Step 1: Write failing stable-ID and validation tests**

```ts
expect(formatEntityId({ pe: 2, kind: 'cell', bank: 5, row: 23 })).toBe('pe2.bg.bank5.row23');
expect(validateTopology({ schemaVersion: '1.0.0', entities: [{ id: 'x', kind: 'module', label: 'A', instance: {} }, { id: 'x', kind: 'module', label: 'B', instance: {} }] }).errors[0]?.code).toBe('duplicate_entity_id');
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/topology/src`

Expected: FAIL because topology functions do not exist.

- [ ] **Step 3: Implement types and deterministic ID formatting**

Support module, cache line, ROB slot, queue slot, register, CELL, crossbar lane, CUBE MAC, StgBufB subspace, and pipe entities. Encode indexes in decimal, lowercase structural names, and never derive IDs from display labels.

- [ ] **Step 4: Implement topology/reference validation**

Validation must report structured diagnostics:

```ts
export interface Diagnostic {
  severity: 'error' | 'warning';
  code: 'duplicate_entity_id' | 'missing_parent' | 'invalid_capacity' | 'missing_entity_reference' | 'instance_out_of_range';
  path: string;
  message: string;
}
```

Check unique IDs, parent existence, positive capacity, unique port IDs per entity, and event reference existence.

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/topology/src`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/topology
git commit -m "feat: add topology descriptors and stable IDs"
```

### Task 4: C++17 TraceSink SDK

**Files:**
- Create: `sdk/cpp/CMakeLists.txt`
- Create: `sdk/cpp/include/linxsimcity/trace/event.h`
- Create: `sdk/cpp/include/linxsimcity/trace/topology.h`
- Create: `sdk/cpp/include/linxsimcity/trace/trace_sink.h`
- Create: `sdk/cpp/include/linxsimcity/trace/bundle_writer.h`
- Create: `sdk/cpp/src/bundle_writer.cpp`
- Create: `sdk/cpp/src/sha256.h`
- Create: `sdk/cpp/src/sha256.cpp`
- Test: `sdk/cpp/tests/bundle_writer_test.cpp`
- Create: `sdk/cpp/cmake/LinxSimCityTraceConfig.cmake.in`

**Interfaces:**
- Produces: `linxsimcity::trace::TraceSink`, `NullTraceSink`, `BundleWriter`, `Event`, `TopologyBuilder`.
- Produces CMake target: `LinxSimCity::trace_sdk`.
- Writer output: logical directory with `manifest.json`, `topology.json`, `strings.json`, `index.json`, `chunks/*.jsonl.gz`, `checkpoints/*.json.gz`.

- [ ] **Step 1: Write a failing C++ contract test**

The test must construct one topology entity, emit two ordered events, close the writer, and assert the five required files exist. It must also assert that emitting `(cycle=3, seq=0)` after `(cycle=3, seq=1)` throws `TraceOrderError`.

- [ ] **Step 2: Configure and verify failure**

Run:

```bash
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
```

Expected: FAIL because SDK headers and target do not exist.

- [ ] **Step 3: Define the SDK interfaces**

Use these signatures:

```cpp
class TraceSink {
public:
    virtual ~TraceSink() = default;
    virtual void SetTopology(TopologyDescriptor topology) = 0;
    virtual void BeginCycle(std::uint64_t cycle) = 0;
    virtual void Emit(Event event) = 0;
    virtual void EndCycle() = 0;
    virtual void Close() = 0;
};

struct WriterOptions {
    std::filesystem::path outputDirectory;
    std::string profile{"pipeline"};
    std::uint64_t chunkCycleSpan{4096};
    std::uint64_t checkpointCycleSpan{4096};
};
```

Assign `seq` in `BundleWriter::Emit`; model hook sites provide cycle, type, scope, entity ID, and payload.

- [ ] **Step 4: Implement logical-bundle writing**

Use RapidJSON for JSON and zlib for gzip. Implement the small internal `sha256.{h,cpp}` utility so the SDK does not acquire an OpenSSL dependency. Flush a chunk when the next event crosses its 4096-cycle boundary. Write checkpoint metadata, compressed byte size, SHA-256, and event count into `index.json`. `Close()` must be idempotent.

- [ ] **Step 5: Build, test, and verify installability**

Run:

```bash
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON -DCMAKE_INSTALL_PREFIX="$PWD/build/install"
cmake --build build/sdk --parallel
ctest --test-dir build/sdk --output-on-failure
cmake --install build/sdk
test -f build/install/lib/cmake/LinxSimCityTrace/LinxSimCityTraceConfig.cmake
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add sdk/cpp
git commit -m "feat: add C++ trace writer SDK"
```

### Task 5: `linxtrace` CLI

**Files:**
- Create: `tools/linxtrace/package.json`
- Create: `tools/linxtrace/tsconfig.json`
- Create: `tools/linxtrace/src/main.ts`
- Create: `tools/linxtrace/src/io.ts`
- Create: `tools/linxtrace/src/validate.ts`
- Create: `tools/linxtrace/src/index-command.ts`
- Create: `tools/linxtrace/src/pack.ts`
- Create: `tools/linxtrace/src/inspect.ts`
- Test: `tools/linxtrace/src/cli.test.ts`

**Interfaces:**
- Consumes: trace schema and topology validators.
- Produces commands: `linxtrace validate`, `linxtrace index`, `linxtrace pack`, `linxtrace inspect`.
- Produces: JSON `ValidationReport { valid, errors, warnings, stats }`.

`tools/linxtrace/package.json` declares exact runtime dependencies `@zip.js/zip.js@2.8.43`, `commander@15.0.0`, `fflate@0.8.3`, `zod@4.4.3`, `@linxsimcity/trace-schema@0.1.0`, and `@linxsimcity/topology@0.1.0`.

- [ ] **Step 1: Write failing CLI tests**

Use child-process tests to assert:

```text
linxtrace validate fixtures/synthetic/minimal.trace-dir --json  => exit 0, valid=true
linxtrace validate fixtures/malformed/missing-entity.trace-dir  => exit 2, code=missing_entity_reference
linxtrace inspect fixtures/synthetic/minimal.trace-dir           => prints schema/profile/cycles/events
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tools/linxtrace/src/cli.test.ts`

Expected: FAIL because executable is missing.

- [ ] **Step 3: Implement directory/ZIP bundle I/O and validation**

Use `@zip.js/zip.js` 2.8.43 for ZIP entry access and `fflate` for gzip. Validation checks required files, schema, strict event ordering, entity references, chunk hashes, index bounds, and instance capacity.

- [ ] **Step 4: Implement index, pack, and inspect**

`index` rebuilds chunk metadata from a logical directory. `pack` writes ZIP entries in lexical order and uses store mode for `*.gz`. `inspect` prints both human-readable output and `--json` output.

- [ ] **Step 5: Run CLI tests**

Run:

```bash
npm run build -w @linxsimcity/linxtrace
npx vitest run tools/linxtrace/src/cli.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/linxtrace package.json package-lock.json
git commit -m "feat: add linxtrace validation and packing CLI"
```

### Task 6: Synthetic Fixtures, Cross-Language Contract, and Public Docs

**Files:**
- Create: `sdk/cpp/examples/write_synthetic.cpp`
- Create: `fixtures/synthetic/minimal.trace-dir/**`
- Create: `fixtures/malformed/missing-entity.trace-dir/**`
- Create: `fixtures/malformed/out-of-order.trace-dir/**`
- Create: `tests/contract/cpp-writer.test.ts`
- Create: `docs/trace-format/README.md`
- Create: `docs/trace-format/events.md`
- Create: `docs/trace-format/topology.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: C++ writer and TypeScript CLI.
- Produces: deterministic fixture with scalar pipeline, Cache, ROB, CELL, Crossbar, CUBE, StgBufB, and TLSU events.

- [ ] **Step 1: Write the failing cross-language test**

The test invokes `write_synthetic`, validates its output with `linxtrace validate`, packs it, revalidates the ZIP, and compares the parsed event count and topology IDs with a checked-in expected JSON object.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/contract/cpp-writer.test.ts`

Expected: FAIL because the example and fixtures do not exist.

- [ ] **Step 3: Add the deterministic synthetic writer**

Emit 256 cycles with fixed IDs and no randomness. Include at least one event for every v1 event category, one cache hit/miss/fill, one ROB wraparound sequence, one four-bank CELL grant, one CELL conflict, one GMMA B broadcast, and one flush.

- [ ] **Step 4: Add malformed fixtures and docs**

Each malformed fixture contains exactly one intended error. Document field tables, compatibility rules, ID grammar, ZIP layout, validation exit codes `0/1/2`, and profile behavior.

- [ ] **Step 5: Run all Plan 1 gates**

Run:

```bash
npm run check
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
ctest --test-dir build/sdk --output-on-failure
npx vitest run tests/contract/cpp-writer.test.ts
node tools/linxtrace/dist/main.js validate fixtures/synthetic/minimal.trace-dir
```

Expected: all PASS; malformed fixtures fail with their documented single diagnostic.

- [ ] **Step 6: Commit and tag the contract baseline**

```bash
git add sdk/cpp/examples fixtures tests/contract docs/trace-format README.md .github/workflows/ci.yml
git commit -m "test: add trace contract fixtures and documentation"
git tag trace-contract-v1.0.0
git push origin main trace-contract-v1.0.0
```

## Plan 1 Completion Gate

- GitHub repository exists at `LinxISA/LinxSimCity` and is public.
- TypeScript and C++ CI jobs pass.
- C++ writer output validates and packs to `.linxtrace`.
- ZIP and directory forms parse identically.
- Schema, topology, event types, profiles, diagnostics, and compatibility rules are documented.
- No viewer or Three.js code has been added.
