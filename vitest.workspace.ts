import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tools/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/viewer/**",
      "packages/scene-core/**",
      "packages/scene-modules/**",
      "packages/trace-runtime/src/causal/**",
      "tools/linxtrace/**",
      "tests/showcase/**",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    passWithNoTests: true,
  },
});
