import { describe, expect, test, vi } from "vitest";

import {
  RunnerClient,
  RunnerClientError,
  deriveLoadedRunFreshness,
} from "./runner-client.js";

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const configuration = {
  configuration: {
    schema: "linxsimcity.run-config" as const,
    schemaVersion: "1" as const,
    backendId: "superscalar-model" as const,
    workloadId: "supernpubench-matmul-fp32-m256-n256-k256" as const,
    scenarioId: "normal" as const,
    parameters: { cellPerfectMode: true, cubeMaxBankPerCycle: 4 },
  },
  configSha256: "a".repeat(64),
  simulatorOverrides: ["cell.perfect_mode=true"],
};

describe("RunnerClient", () => {
  test("uses catalog, configuration, then job APIs without changing the export", async () => {
    const calls: { readonly url: string; readonly init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/catalog")) {
        return response({ backends: [], workloads: [], scenarios: [] });
      }
      if (url.endsWith("/configurations")) return response(configuration);
      return response(
        {
          id: "job-1",
          status: "running",
          configuration: configuration.configuration,
          configSha256: configuration.configSha256,
          createdAt: "now",
          startedAt: "now",
          stdout: "",
          stderr: "",
        },
        202,
      );
    });
    const client = new RunnerClient("http://127.0.0.1:4317/", fetchMock);
    await client.catalog();
    const exported = await client.exportConfiguration({
      backendId: "superscalar-model",
      workloadId: configuration.configuration.workloadId,
      scenarioId: "normal",
      parameters: {},
    });
    await client.startJob(exported);
    expect(calls.map((item) => item.url)).toEqual([
      "http://127.0.0.1:4317/catalog",
      "http://127.0.0.1:4317/configurations",
      "http://127.0.0.1:4317/jobs",
    ]);
    expect(JSON.parse(String(calls[2]!.init?.body))).toEqual(configuration);
  });

  test("polls, cancels, resolves bundle URLs, and bounds diagnostics", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/cancel")) {
        return response({
          id: "job-1",
          status: "cancelling",
          configSha256: "a",
        });
      }
      return response({ id: "job-1", status: "failed", configSha256: "a" });
    });
    const client = new RunnerClient("http://127.0.0.1:4317", fetchMock);
    expect((await client.getJob("job-1")).status).toBe("failed");
    expect((await client.cancelJob("job-1")).status).toBe("cancelling");
    expect(
      client.bundleBaseUrl({
        bundleBaseUrl: "/jobs/job-1/bundle/",
        manifest: {
          runId: "job-1",
          topologyFingerprint: "fp",
          simulatorRevision: "rev",
          configSha256: "a",
          workloadName: "workload",
          workloadSha256: "sha",
        },
      }),
    ).toBe("http://127.0.0.1:4317/jobs/job-1/bundle/");

    const failing = new RunnerClient("http://runner", async () =>
      response({ error: "x".repeat(900) }, 400),
    );
    await expect(failing.catalog()).rejects.toSatisfy(
      (error: RunnerClientError) => error.message.length === 480,
    );
  });
});

describe("loaded run freshness", () => {
  test("marks a loaded result stale as soon as selected config hash changes", () => {
    expect(deriveLoadedRunFreshness(undefined, "next")).toBe("empty");
    expect(deriveLoadedRunFreshness("same", "same")).toBe("current");
    expect(deriveLoadedRunFreshness("old", "new")).toBe("stale");
  });
});
