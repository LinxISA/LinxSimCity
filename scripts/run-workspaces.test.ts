import { describe, expect, test } from "vitest";

import {
  declarationWorkspaces,
  workspaceExecutionPlan,
} from "./run-workspaces.mjs";

describe("workspace execution plan", () => {
  test("builds every workspace once in dependency order", () => {
    expect(workspaceExecutionPlan("build")).toEqual([
      ["build", "@linxsimcity/trace-schema"],
      ["build", "@linxsimcity/topology"],
      ["build", "@linxsimcity/trace-runtime"],
      ["build", "@linxsimcity/scene-core"],
      ["build", "@linxsimcity/scene-modules"],
      ["build", "@linxsimcity/viewer"],
      ["build", "@linxsimcity/linxtrace"],
    ]);
  });

  test("typecheck builds declarations once before checking every workspace", () => {
    const plan = workspaceExecutionPlan("typecheck");

    expect(plan.slice(0, declarationWorkspaces.length)).toEqual(
      declarationWorkspaces.map((workspace) => ["build", workspace]),
    );
    expect(plan.slice(declarationWorkspaces.length)).toEqual([
      ["root-typecheck", "linxsimcity"],
      ["typecheck", "@linxsimcity/trace-schema"],
      ["typecheck", "@linxsimcity/topology"],
      ["typecheck", "@linxsimcity/trace-runtime"],
      ["typecheck", "@linxsimcity/scene-core"],
      ["typecheck", "@linxsimcity/scene-modules"],
      ["typecheck", "@linxsimcity/viewer"],
      ["typecheck", "@linxsimcity/linxtrace"],
    ]);
  });

  test("rejects unknown modes before spawning a child process", () => {
    expect(() => workspaceExecutionPlan("unknown")).toThrow(
      "Expected workspace command to be build or typecheck",
    );
  });
});
