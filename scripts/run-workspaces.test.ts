import { describe, expect, test } from "vitest";

import {
  declarationWorkspaces,
  workspaceExecutionPlan,
} from "./run-workspaces.mjs";

describe("workspace execution plan", () => {
  test("builds every workspace once in dependency order", () => {
    expect(workspaceExecutionPlan("build")).toEqual([
      ["build", "@linxsimcity/component-catalog"],
      ["build", "@linxsimcity/world"],
      ["build", "@linxsimcity/topology-import"],
      ["build", "@linxsimcity/trace-schema"],
      ["build", "@linxsimcity/simtrace"],
      ["build", "@linxsimcity/trace-runtime"],
      ["build", "@linxsimcity/brick-kit"],
      ["build", "@linxsimcity/game"],
    ]);
  });

  test("typecheck builds declarations once before checking every workspace", () => {
    const plan = workspaceExecutionPlan("typecheck");

    expect(plan.slice(0, declarationWorkspaces.length)).toEqual(
      declarationWorkspaces.map((workspace) => ["build", workspace]),
    );
    expect(plan.slice(declarationWorkspaces.length)).toEqual([
      ["root-typecheck", "linxsimcity"],
      ["typecheck", "@linxsimcity/component-catalog"],
      ["typecheck", "@linxsimcity/world"],
      ["typecheck", "@linxsimcity/topology-import"],
      ["typecheck", "@linxsimcity/trace-schema"],
      ["typecheck", "@linxsimcity/simtrace"],
      ["typecheck", "@linxsimcity/trace-runtime"],
      ["typecheck", "@linxsimcity/brick-kit"],
      ["typecheck", "@linxsimcity/game"],
    ]);
  });

  test("rejects unknown modes before spawning a child process", () => {
    expect(() => workspaceExecutionPlan("unknown")).toThrow(
      "Expected workspace command to be build or typecheck",
    );
  });
});
