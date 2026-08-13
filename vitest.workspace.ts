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
    fileParallelism: false,
    maxWorkers: 1,
    passWithNoTests: true,
  },
});
