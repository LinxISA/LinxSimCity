import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("registry lock entries retain tarball resolution and integrity", () => {
  const lockfile = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  ) as {
    packages: Record<
      string,
      { integrity?: string; link?: boolean; resolved?: string }
    >;
  };
  const incompleteEntries = Object.entries(lockfile.packages)
    .filter(([path, entry]) => path.startsWith("node_modules/") && !entry.link)
    .filter(([, entry]) => !entry.resolved || !entry.integrity)
    .map(([path]) => path);

  expect(incompleteEntries).toEqual([]);
});
