import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function runRootScript(script: "build" | "typecheck") {
  return spawnSync("npm", ["run", script], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function copySourceOnlyRepository(destination: string) {
  for (const path of [
    "eslint.config.js",
    "package-lock.json",
    "package.json",
    "apps",
    "packages",
    "scripts",
    "tests",
    "tools",
    "tsconfig.base.json",
    "tsconfig.json",
    "vitest.config.ts",
    "vitest.workspace.ts",
  ]) {
    cpSync(join(repositoryRoot, path), join(destination, path), {
      recursive: true,
      filter: (source) => basename(source) !== "dist",
    });
  }
}

function linkInstalledDependencies(destination: string) {
  const sourceNodeModules = join(repositoryRoot, "node_modules");
  const targetNodeModules = join(destination, "node_modules");
  mkdirSync(targetNodeModules);

  for (const entry of readdirSync(sourceNodeModules)) {
    if (entry === "@linxsimcity") {
      continue;
    }
    symlinkSync(join(sourceNodeModules, entry), join(targetNodeModules, entry));
  }

  for (const workspaceRoot of ["apps", "packages", "tools"]) {
    const root = join(destination, workspaceRoot);
    for (const workspace of readdirSync(root)) {
      const packageRoot = join(root, workspace);
      const packageJson = JSON.parse(
        readFileSync(join(packageRoot, "package.json"), "utf8"),
      ) as { name: string };
      const [scope, name] = packageJson.name.split("/");
      if (!scope || !name) continue;
      const scopeRoot = join(targetNodeModules, scope);
      mkdirSync(scopeRoot, { recursive: true });
      symlinkSync(packageRoot, join(scopeRoot, name));
    }
  }
}

describe("root workspace scripts", () => {
  test.each(["build", "typecheck"] as const)(
    "%s invokes matching workspace scripts",
    (script) => {
      const result = runRootScript(script);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `@linxsimcity/trace-schema@0.1.0 ${script}`,
      );
      expect(result.stdout).toContain(`@linxsimcity/topology@0.1.0 ${script}`);
      expect(
        result.stdout.match(
          new RegExp(`@linxsimcity/trace-schema@0\\.1\\.0 ${script}`, "g"),
        ),
      ).toHaveLength(1);
      expect(
        result.stdout.match(
          new RegExp(`@linxsimcity/topology@0\\.1\\.0 ${script}`, "g"),
        ),
      ).toHaveLength(1);
    },
    90_000,
  );

  test("build and typecheck succeed from source without prebuilt workspace artifacts", () => {
    const cleanRepository = mkdtempSync(
      join(tmpdir(), "linxsimcity-source-only-"),
    );

    try {
      copySourceOnlyRepository(cleanRepository);
      linkInstalledDependencies(cleanRepository);

      const build = spawnSync("npm", ["run", "build"], {
        cwd: cleanRepository,
        encoding: "utf8",
      });
      expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);

      rmSync(join(cleanRepository, "packages", "topology", "dist"), {
        recursive: true,
        force: true,
      });
      rmSync(join(cleanRepository, "packages", "trace-schema", "dist"), {
        recursive: true,
        force: true,
      });

      const typecheck = spawnSync("npm", ["run", "typecheck"], {
        cwd: cleanRepository,
        encoding: "utf8",
      });
      expect(typecheck.status, `${typecheck.stdout}\n${typecheck.stderr}`).toBe(
        0,
      );
    } finally {
      rmSync(cleanRepository, { recursive: true, force: true });
    }
  }, 120_000);
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
