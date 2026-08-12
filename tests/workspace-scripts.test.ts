import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function runRootScript(script: "build" | "typecheck") {
  return spawnSync("npm", ["run", script], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

describe("root workspace scripts", () => {
  test.each(["build", "typecheck"] as const)(
    "%s invokes matching workspace scripts",
    (script) => {
      const result = runRootScript(script);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`workspace-verifier:${script}`);
    },
  );
});
