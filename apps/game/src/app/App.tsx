import {
  buildDavinciCatalogIndex,
  CORE_BRICK_BY_ID,
  CORE_CATALOG,
  locateDavinciCandidate,
  validateDavinciCatalogMapping,
} from "@linxsimcity/component-catalog";
import type {
  BrickDefinition,
  DavinciCandidateMapping,
  DavinciCatalogIndexEntry,
  DavinciCatalogMapping,
} from "@linxsimcity/component-catalog";
import type { BrickActivity } from "@linxsimcity/brick-kit";
import {
  CHALLENGES,
  evaluateChallenge,
  evaluateImprovementChallenge,
  type ChallengeEvaluation,
  type ChallengeDefinition,
  type ChallengeId,
  type ChallengeRunEvidence,
  type ExportedRunConfiguration,
  type ObservableMetricId,
  type RunConfiguration,
} from "@linxsimcity/scenarios";
import {
  DEFAULT_RUNNER_BASE_URL,
  RunnerClient,
  deriveLoadedRunFreshness,
  type RunnerCatalog,
  type RunnerJob,
} from "./runner-client.js";
import {
  SeekSupersededError,
  TraceWorkerClient,
  type LoadedTraceInfo,
  type SimTraceSnapshot,
} from "@linxsimcity/trace-runtime";
import {
  generateWorldFromTopology,
  positionToTuple,
  validateArchitectureTopology,
} from "@linxsimcity/world";
import type {
  ArchitectureTopology,
  TopologyEdge,
  TopologyNode,
} from "@linxsimcity/world";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  loadBundledCatalog,
  loadBundledTopology,
  parseArchitectureTopology,
} from "./topology.js";
import {
  deriveTopologyView,
  parseTopologyViewPreferences,
  topologyPathForTraceAssociation,
  type HierarchyDepthSlice,
  type TopologyViewPreferences,
} from "./topology-view.js";
import "./styles.css";

const WorldScene = lazy(async () => {
  const module = await import("@linxsimcity/brick-kit");
  return { default: module.WorldScene };
});

const RECORDED_RUNS = [
  {
    id: "normal",
    label: "正常 Matmul",
    shortLabel: "NORMAL",
    path: "runs/superscalar-matmul.bundle",
    initialCycle: "305",
  },
  {
    id: "bank-conflict",
    label: "Bank Conflict",
    shortLabel: "BANK CONFLICT",
    path: "runs/superscalar-matmul-conflict.bundle",
    initialCycle: "305",
  },
  {
    id: "bank-improved",
    label: "Improved ×2",
    shortLabel: "IMPROVED ×2",
    path: "runs/superscalar-matmul-improved.bundle",
    initialCycle: "305",
  },
] as const;

const TOPOLOGY_VIEW_STORAGE_KEY = "linxsimcity.topology-view";
const DEPTH_SLICES: readonly {
  readonly id: HierarchyDepthSlice;
  readonly label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "l1", label: "L1" },
  { id: "l2", label: "L2" },
  { id: "leaf", label: "Leaf" },
];

const CHALLENGE_LIST = Object.values(CHALLENGES);
const METRIC_LABELS: Readonly<Record<ObservableMetricId, string>> = {
  cycles: "Cycles",
  queueBackpressureCycles: "Queue backpressure",
  bankConflictCycles: "Bank conflicts",
  waitCycles: "Wait cycles",
  tileTransferCount: "Tile transfers",
};

type RecordedRunId = (typeof RECORDED_RUNS)[number]["id"];

type RunnerConnection = "connecting" | "connected" | "offline";

interface LoadedChallengeRun {
  readonly source: "recorded" | "runner";
  readonly label: string;
  readonly evidence: ChallengeRunEvidence;
  readonly configSha256: string;
}

export interface CatalogH2Branch {
  readonly id: string;
  readonly label: string;
  readonly candidates: readonly DavinciCandidateMapping[];
}

export interface CatalogH1Branch {
  readonly id: string;
  readonly label: string;
  readonly candidateCount: number;
  readonly subsystems: readonly CatalogH2Branch[];
}

function catalogCandidateMatches(
  candidate: DavinciCandidateMapping,
  query: string,
): boolean {
  return [
    candidate.candidateId,
    candidate.h1,
    candidate.h2,
    candidate.h3,
    candidate.name,
    candidate.representation,
    candidate.dispositionRecommendation,
    candidate.observedEvidenceStatus,
  ].some((value) => value.toLowerCase().includes(query));
}

export function buildCatalogTree(
  candidates: readonly DavinciCandidateMapping[],
  filter: string,
): readonly CatalogH1Branch[] {
  const query = filter.trim().toLowerCase();
  const hierarchy = new Map<string, Map<string, DavinciCandidateMapping[]>>();

  for (const candidate of candidates) {
    if (query && !catalogCandidateMatches(candidate, query)) continue;
    let subsystems = hierarchy.get(candidate.h1);
    if (!subsystems) {
      subsystems = new Map();
      hierarchy.set(candidate.h1, subsystems);
    }
    let branch = subsystems.get(candidate.h2);
    if (!branch) {
      branch = [];
      subsystems.set(candidate.h2, branch);
    }
    branch.push(candidate);
  }

  return [...hierarchy].map(([h1, subsystems]) => {
    const branches = [...subsystems].map(([h2, branch]) => ({
      id: `${h1}:${h2}`,
      label: h2,
      candidates: branch,
    }));
    return {
      id: h1,
      label: h1,
      candidateCount: branches.reduce(
        (count, branch) => count + branch.candidates.length,
        0,
      ),
      subsystems: branches,
    };
  });
}

export function findCatalogCandidateLocation(
  candidates: readonly DavinciCandidateMapping[],
  candidateId: string,
):
  | { readonly candidate: DavinciCandidateMapping; readonly branchId: string }
  | undefined {
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  return candidate
    ? { candidate, branchId: `${candidate.h1}:${candidate.h2}` }
    : undefined;
}

function nodeConnections(
  topology: ArchitectureTopology,
  nodeId: string,
): { incoming: TopologyEdge[]; outgoing: TopologyEdge[] } {
  return {
    incoming: topology.edges.filter((edge) => edge.to.nodeId === nodeId),
    outgoing: topology.edges.filter((edge) => edge.from.nodeId === nodeId),
  };
}

function topologyNodePath(
  topology: ArchitectureTopology,
  node: TopologyNode,
): string {
  const byId = new Map(topology.nodes.map((item) => [item.id, item]));
  const path: string[] = [];
  let current: TopologyNode | undefined = node;
  while (current) {
    path.unshift(current.label ?? current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.join(" › ");
}

function selectedChallengeConfiguration(
  challengeId: ChallengeId,
  cubeMaxBankPerCycle: number,
): RunConfiguration {
  const initial = CHALLENGES[challengeId].initialConfiguration;
  return challengeId === "reduce-bank-conflicts"
    ? {
        ...initial,
        parameters: {
          ...initial.parameters,
          cellPerfectMode: false,
          cubeMaxBankPerCycle,
        },
      }
    : initial;
}

function recordedRunConfiguration(runId: RecordedRunId): RunConfiguration {
  if (runId === "normal") {
    return CHALLENGES["explain-topology"].initialConfiguration;
  }
  if (runId === "bank-conflict") {
    return CHALLENGES["find-queue-bottleneck"].initialConfiguration;
  }
  return selectedChallengeConfiguration("reduce-bank-conflicts", 2);
}

function configurationIntent(configuration: RunConfiguration): string {
  return JSON.stringify({
    backendId: configuration.backendId,
    workloadId: configuration.workloadId,
    scenarioId: configuration.scenarioId,
    parameters: Object.fromEntries(
      Object.entries(configuration.parameters).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

function insufficientEvaluation(
  challengeId: ChallengeId,
  diagnostic: string,
): ChallengeEvaluation {
  return {
    challengeId,
    status: "insufficient-evidence",
    diagnostics: [diagnostic],
    observed: {},
  };
}

async function loadRecordedMetrics(
  bundleBaseUrl: string,
): Promise<ChallengeRunEvidence["metrics"]> {
  const response = await fetch(
    `${bundleBaseUrl.replace(/\/?$/u, "/")}metrics.json`,
    { cache: "no-store" },
  );
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`录制回放 metrics.json 返回 HTTP ${response.status}。`);
  }
  return (await response.json()) as ChallengeRunEvidence["metrics"];
}

async function loadRecordedEvidence(
  run: (typeof RECORDED_RUNS)[number],
): Promise<ChallengeRunEvidence> {
  const baseUrl = new URL(
    `${import.meta.env.BASE_URL}${run.path}`,
    window.location.href,
  ).href;
  const manifestResponse = await fetch(
    `${baseUrl.replace(/\/?$/u, "/")}manifest.json`,
    { cache: "no-store" },
  );
  if (!manifestResponse.ok) {
    throw new Error(`录制回放 manifest 返回 HTTP ${manifestResponse.status}。`);
  }
  const [manifest, metrics] = await Promise.all([
    manifestResponse.json() as Promise<ChallengeRunEvidence["manifest"]>,
    loadRecordedMetrics(baseUrl),
  ]);
  return {
    configuration: recordedRunConfiguration(run.id),
    manifest,
    ...(metrics ? { metrics } : {}),
  };
}

export function App() {
  const [topology, setTopology] = useState<ArchitectureTopology>();
  const [catalog, setCatalog] = useState<DavinciCatalogMapping>();
  const [browserMode, setBrowserMode] = useState<"topology" | "catalog">(
    "topology",
  );
  const [loadError, setLoadError] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEntry, setSelectedEntry] = useState<{
    readonly instanceId: string;
    readonly logicalIndex: number;
  }>();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>();
  const [expandedCatalogH1, setExpandedCatalogH1] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedCatalogH2, setExpandedCatalogH2] = useState<Set<string>>(
    () => new Set(),
  );
  const [locatedOwnerId, setLocatedOwnerId] = useState<string>();
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("正在加载 pyCircuit QueueGraph 拓扑…");
  const [traceInfo, setTraceInfo] = useState<LoadedTraceInfo>();
  const [traceSnapshot, setTraceSnapshot] = useState<SimTraceSnapshot>();
  const [traceCycle, setTraceCycle] = useState("0");
  const [cycleDraft, setCycleDraft] = useState("0");
  const [tracePlaying, setTracePlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [recordedRunId, setRecordedRunId] = useState<RecordedRunId>("normal");
  const [topologyViewPreferences, setTopologyViewPreferences] =
    useState<TopologyViewPreferences>(() =>
      parseTopologyViewPreferences(
        typeof window === "undefined"
          ? null
          : window.localStorage.getItem(TOPOLOGY_VIEW_STORAGE_KEY),
      ),
    );
  const [runnerConnection, setRunnerConnection] =
    useState<RunnerConnection>("connecting");
  const [runnerCatalog, setRunnerCatalog] = useState<RunnerCatalog>();
  const [runnerDiagnostic, setRunnerDiagnostic] = useState<string>();
  const [selectedChallengeId, setSelectedChallengeId] =
    useState<ChallengeId>("explain-topology");
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [cubeMaxBankPerCycle, setCubeMaxBankPerCycle] = useState(2);
  const [exportedConfiguration, setExportedConfiguration] =
    useState<ExportedRunConfiguration>();
  const [runnerJob, setRunnerJob] = useState<RunnerJob>();
  const [loadedChallengeRun, setLoadedChallengeRun] =
    useState<LoadedChallengeRun>();
  const [baselineEvidence, setBaselineEvidence] =
    useState<ChallengeRunEvidence>();
  const [improvedEvidence, setImprovedEvidence] =
    useState<ChallengeRunEvidence>();
  const importInput = useRef<HTMLInputElement>(null);
  const catalogCandidateElements = useRef(new Map<string, HTMLButtonElement>());
  const traceClient = useRef<TraceWorkerClient | undefined>(undefined);
  const traceRequestId = useRef(0);
  const runnerClient = useRef(new RunnerClient());
  const loadedRunnerJobId = useRef<string | undefined>(undefined);
  const diagnostics = useMemo(
    () =>
      topology ? validateArchitectureTopology(topology, CORE_CATALOG) : [],
    [topology],
  );
  const world = useMemo(
    () =>
      topology && diagnostics.length === 0
        ? generateWorldFromTopology(topology, CORE_CATALOG)
        : undefined,
    [diagnostics.length, topology],
  );
  const topologyView = useMemo(
    () =>
      topology
        ? deriveTopologyView(topology, topologyViewPreferences)
        : undefined,
    [topology, topologyViewPreferences],
  );
  const traceActivity = useMemo(() => {
    if (!world || !traceSnapshot) return undefined;
    const activity = new Map<string, BrickActivity>(
      world.instances.map((instance) => [
        instance.id,
        { source: "trace", occupiedEntries: 0, headIndex: 0 },
      ]),
    );
    for (const queue of traceSnapshot.queues) {
      const slots = queue.tokens.flatMap((token) =>
        token.slot === null ? [] : [token.slot],
      );
      activity.set(queue.queueId, {
        source: "trace",
        occupiedEntries: queue.occupancy,
        headIndex: slots.length > 0 ? Math.min(...slots) : 0,
        activeEntryIndices: slots,
      });
    }
    for (const instance of world.instances) {
      const residencies = traceSnapshot.tileResidencies.filter(
        (item) => item.storageNodeId === instance.id,
      );
      if (residencies.length > 0) {
        const tileIds = [...new Set(residencies.map((item) => item.tileId))];
        const rows = Math.max(1, instance.parameters.rows ?? 1);
        activity.set(instance.id, {
          source: "trace",
          occupiedEntries: residencies.length,
          headIndex: 0,
          activeEntryIndices: [
            ...new Set(
              residencies.flatMap((item) =>
                item.bank === undefined
                  ? item.row === undefined
                    ? item.slot === undefined
                      ? []
                      : [item.slot]
                    : [item.row]
                  : [item.bank * rows + (item.row ?? item.slot ?? 0)],
              ),
            ),
          ],
          labels:
            tileIds.length === 1
              ? [tileIds[0]!]
              : [`${tileIds.length} Tiles · ${residencies.length} fragments`],
        });
      }
    }
    for (const computation of traceSnapshot.computations) {
      if (computation.status === "active") {
        activity.set(computation.entityId, {
          source: "trace",
          occupiedEntries: 1,
          headIndex: 0,
          labels: [computation.operation],
        });
      }
    }
    return activity;
  }, [traceSnapshot, world]);
  const selectedNode = topology?.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const selectedDefinition = selectedNode
    ? CORE_BRICK_BY_ID.get(selectedNode.definitionId)
    : undefined;
  const selectedCandidate = catalog?.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );
  const catalogIndex = useMemo(
    () => (catalog ? buildDavinciCatalogIndex(catalog) : undefined),
    [catalog],
  );
  const selectedCatalogEntry =
    catalogIndex && selectedCandidateId
      ? locateDavinciCandidate(catalogIndex, selectedCandidateId)
      : undefined;
  const orderedNodes = useMemo(() => {
    if (!topology || !world) return [];
    const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
    return world.instances
      .filter((instance) => instance.topologyOrder >= 0)
      .sort(
        (left, right) =>
          left.topologyRank - right.topologyRank ||
          left.topologyOrder - right.topologyOrder,
      )
      .map((instance) => ({ instance, node: nodeById.get(instance.id)! }));
  }, [topology, world]);
  const worldInstanceById = useMemo(
    () => new Map(world?.instances.map((instance) => [instance.id, instance])),
    [world],
  );
  const visibleNodes = (topologyView?.entries ?? []).filter(({ node }) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    const definition = CORE_BRICK_BY_ID.get(node.definitionId);
    return [node.id, node.label, definition?.label, definition?.kind]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
  const catalogTree = useMemo(
    () => buildCatalogTree(catalog?.candidates ?? [], filter),
    [catalog, filter],
  );
  const visibleCandidateCount = catalogTree.reduce(
    (count, branch) => count + branch.candidateCount,
    0,
  );
  const catalogSearchActive = filter.trim().length > 0;
  const recordedRun = RECORDED_RUNS.find((run) => run.id === recordedRunId)!;
  const selectedChallenge = CHALLENGES[selectedChallengeId];
  const selectedRunConfiguration = useMemo(
    () =>
      selectedChallengeConfiguration(selectedChallengeId, cubeMaxBankPerCycle),
    [cubeMaxBankPerCycle, selectedChallengeId],
  );
  const loadedRunStale =
    deriveLoadedRunFreshness(
      loadedChallengeRun
        ? configurationIntent(loadedChallengeRun.evidence.configuration)
        : undefined,
      configurationIntent(selectedRunConfiguration),
    ) === "stale";
  const challengeEvaluations = useMemo(() => {
    const evaluations = {} as Record<ChallengeId, ChallengeEvaluation>;
    for (const challenge of CHALLENGE_LIST) {
      try {
        if (challenge.id === "reduce-bank-conflicts") {
          evaluations[challenge.id] =
            baselineEvidence && improvedEvidence
              ? evaluateImprovementChallenge(baselineEvidence, improvedEvidence)
              : insufficientEvaluation(
                  challenge.id,
                  "需要 baseline 和 improved 两次绑定运行。",
                );
        } else {
          evaluations[challenge.id] = loadedChallengeRun
            ? evaluateChallenge(challenge.id, loadedChallengeRun.evidence)
            : insufficientEvaluation(challenge.id, "尚未加载绑定运行证据。");
        }
      } catch (error) {
        evaluations[challenge.id] = insufficientEvaluation(
          challenge.id,
          error instanceof Error ? error.message : "挑战证据无法评估。",
        );
      }
    }
    if (loadedRunStale) {
      evaluations[selectedChallengeId] = {
        challengeId: selectedChallengeId,
        status: "stale-run",
        diagnostics: ["配置已经改变；当前画面来自旧配置，请重新运行。"],
        observed: evaluations[selectedChallengeId].observed,
      };
    }
    return evaluations;
  }, [
    baselineEvidence,
    improvedEvidence,
    loadedChallengeRun,
    loadedRunStale,
    selectedChallengeId,
  ]);
  const selectedEvaluation = challengeEvaluations[selectedChallengeId];

  useEffect(() => {
    window.localStorage.setItem(
      TOPOLOGY_VIEW_STORAGE_KEY,
      JSON.stringify(topologyViewPreferences),
    );
  }, [topologyViewPreferences]);

  useEffect(() => {
    if (
      selectedNodeId &&
      topologyView &&
      !topologyView.visibleNodeIds.has(selectedNodeId)
    ) {
      setSelectedNodeId(undefined);
    }
  }, [selectedNodeId, topologyView]);

  const setDepthSlice = (depthSlice: HierarchyDepthSlice) => {
    setTopologyViewPreferences((current) => ({ ...current, depthSlice }));
  };

  const toggleTopologyNode = (nodeId: string) => {
    setTopologyViewPreferences((current) => {
      const collapsed = new Set(current.collapsedNodeIds);
      if (collapsed.has(nodeId)) collapsed.delete(nodeId);
      else collapsed.add(nodeId);
      return { ...current, collapsedNodeIds: [...collapsed] };
    });
  };

  const focusTopologyEdges = (edgeIds: readonly string[]) => {
    setTopologyViewPreferences((current) => ({
      ...current,
      focusedEdgeIds: [...new Set(edgeIds)],
    }));
  };

  const focusTraceAssociation = (
    entityNodeId: string,
    storageNodeId: string,
  ) => {
    if (!topology) return;
    const path = topologyPathForTraceAssociation(
      topology,
      entityNodeId,
      storageNodeId,
    );
    focusTopologyEdges(path?.edgeIds ?? []);
    setNotice(
      path?.edgeIds.length
        ? `已聚焦 ${path.edgeIds.length} 条关联拓扑边。`
        : "该 Trace 关联没有可回指的拓扑边。",
    );
  };

  const toggleCatalogBranch = (level: "h1" | "h2", id: string) => {
    const setter = level === "h1" ? setExpandedCatalogH1 : setExpandedCatalogH2;
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const locateCatalogOwner = (ownerCandidateId: string) => {
    const location = findCatalogCandidateLocation(
      catalog?.candidates ?? [],
      ownerCandidateId,
    );
    if (!location) {
      setNotice(`目录中找不到 owner ${ownerCandidateId}。`);
      return;
    }
    const owner = location.candidate;
    setBrowserMode("catalog");
    setFilter("");
    setExpandedCatalogH1((current) => new Set(current).add(owner.h1));
    setExpandedCatalogH2((current) => new Set(current).add(location.branchId));
    setSelectedNodeId(undefined);
    setSelectedCandidateId(ownerCandidateId);
    setLocatedOwnerId(ownerCandidateId);
    setNotice(`已定位 canonical owner：${ownerCandidateId}。`);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        catalogCandidateElements.current
          .get(ownerCandidateId)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
  };

  const connectRunner = useCallback(async (reportFailure = true) => {
    setRunnerConnection("connecting");
    setRunnerDiagnostic(undefined);
    try {
      const nextCatalog = await runnerClient.current.catalog();
      setRunnerCatalog(nextCatalog);
      setRunnerConnection("connected");
    } catch (error) {
      setRunnerCatalog(undefined);
      setRunnerConnection("offline");
      setRunnerDiagnostic(
        reportFailure
          ? error instanceof Error
            ? error.message
            : "本地 runner 不可用。"
          : undefined,
      );
    }
  }, []);

  useEffect(() => {
    void connectRunner(false);
  }, [connectRunner]);

  const closeTrace = useCallback(() => {
    const client = traceClient.current;
    traceClient.current = undefined;
    traceRequestId.current += 1;
    setTraceInfo(undefined);
    setTraceSnapshot(undefined);
    setTracePlaying(false);
    setTraceCycle("0");
    setCycleDraft("0");
    setLoadedChallengeRun(undefined);
    void client?.close();
  }, []);

  useEffect(
    () => () => {
      const client = traceClient.current;
      traceClient.current = undefined;
      traceRequestId.current += 1;
      void client?.close();
    },
    [],
  );

  const loadDefault = useCallback(async () => {
    try {
      closeTrace();
      setLoadError(undefined);
      const [next, nextCatalog] = await Promise.all([
        loadBundledTopology(),
        loadBundledCatalog(),
      ]);
      const nextDiagnostics = validateArchitectureTopology(next, CORE_CATALOG);
      if (nextDiagnostics.length > 0) {
        throw new Error(
          `内置拓扑校验失败：${nextDiagnostics[0]!.path} ${nextDiagnostics[0]!.message}`,
        );
      }
      const catalogDiagnostics = validateDavinciCatalogMapping(nextCatalog);
      if (catalogDiagnostics.length > 0) {
        throw new Error(
          `H3 目录校验失败：${catalogDiagnostics[0]!.path} ${catalogDiagnostics[0]!.message}`,
        );
      }
      setTopology(next);
      setCatalog(nextCatalog);
      setSelectedNodeId(undefined);
      setSelectedCandidateId(undefined);
      setNotice(
        `已加载 ${next.nodes.length} 个运行拓扑节点和 ${nextCatalog.candidates.length} 项 H3 目录。`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法加载内置拓扑。";
      setLoadError(message);
      setNotice(message);
    }
  }, [closeTrace]);

  const importTopology = async (file: File) => {
    try {
      closeTrace();
      const next = parseArchitectureTopology(await file.text());
      const nextDiagnostics = validateArchitectureTopology(next, CORE_CATALOG);
      if (nextDiagnostics.length > 0) {
        throw new Error(
          `拓扑校验失败：${nextDiagnostics[0]!.path} ${nextDiagnostics[0]!.message}`,
        );
      }
      setTopology(next);
      setSelectedNodeId(undefined);
      setSelectedCandidateId(undefined);
      setBrowserMode("topology");
      setNotice(
        `已从 ${next.name} 生成 ${next.nodes.length} 个组件和 ${next.edges.length} 条连接。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取拓扑。");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const seekTrace = useCallback(
    async (cycle: string) => {
      const client = traceClient.current;
      if (!client || !traceInfo) return;
      if (!/^(0|[1-9][0-9]{0,19})$/u.test(cycle)) {
        setNotice("Cycle 必须是无损十进制 u64 字符串。");
        return;
      }
      if (
        BigInt(cycle) < BigInt(traceInfo.manifest.window.firstCycle) ||
        BigInt(cycle) > BigInt(traceInfo.manifest.window.lastCycle)
      ) {
        setNotice(
          `Cycle ${cycle} 超出 ${traceInfo.manifest.window.firstCycle}..${traceInfo.manifest.window.lastCycle}。`,
        );
        return;
      }
      const requestId = ++traceRequestId.current;
      try {
        const snapshot = await client.seek("core", cycle, requestId);
        if (requestId !== traceRequestId.current) return;
        setTraceSnapshot(snapshot);
        setTraceCycle(cycle);
        setCycleDraft(cycle);
      } catch (error) {
        if (error instanceof SeekSupersededError) return;
        setTracePlaying(false);
        setNotice(error instanceof Error ? error.message : "Trace seek 失败。");
      }
    },
    [traceInfo],
  );

  const loadRecordedTrace = useCallback(
    async (requestedRunId?: RecordedRunId) => {
      const targetRunId = requestedRunId ?? recordedRunId;
      const targetRun = RECORDED_RUNS.find((run) => run.id === targetRunId)!;
      closeTrace();
      setNotice("正在 Worker 中加载 SuperScalarModel 录制回放…");
      let client: TraceWorkerClient | undefined;
      const loadRequestId = ++traceRequestId.current;
      try {
        client = TraceWorkerClient.spawn();
        traceClient.current = client;
        const baseUrl = new URL(
          `${import.meta.env.BASE_URL}${targetRun.path}`,
          window.location.href,
        ).href;
        const [info, nextCatalog, metrics] = await Promise.all([
          client.load({ kind: "http-directory", baseUrl }),
          loadBundledCatalog(),
          loadRecordedMetrics(baseUrl),
        ]);
        if (loadRequestId !== traceRequestId.current) {
          await client.close();
          return;
        }
        const nextDiagnostics = validateArchitectureTopology(
          info.topology,
          CORE_CATALOG,
        );
        if (nextDiagnostics.length > 0) {
          throw new Error(
            `Trace topology 校验失败：${nextDiagnostics[0]!.path} ${nextDiagnostics[0]!.message}`,
          );
        }
        const catalogDiagnostics = validateDavinciCatalogMapping(nextCatalog);
        if (catalogDiagnostics.length > 0) {
          throw new Error(
            `H3 目录校验失败：${catalogDiagnostics[0]!.path} ${catalogDiagnostics[0]!.message}`,
          );
        }
        setTopology(info.topology);
        setCatalog(nextCatalog);
        setTraceInfo(info);
        setSelectedNodeId(undefined);
        setSelectedCandidateId(undefined);
        setBrowserMode("topology");
        const firstCycle = info.manifest.window.firstCycle;
        const preferredCycle = BigInt(targetRun.initialCycle);
        const initialCycle =
          preferredCycle >= BigInt(firstCycle) &&
          preferredCycle <= BigInt(info.manifest.window.lastCycle)
            ? targetRun.initialCycle
            : firstCycle;
        const requestId = ++traceRequestId.current;
        const snapshot = await client.seek("core", initialCycle, requestId);
        setTraceSnapshot(snapshot);
        setTraceCycle(initialCycle);
        setCycleDraft(initialCycle);
        const challengeConfiguration = recordedRunConfiguration(targetRunId);
        const evidence: ChallengeRunEvidence = {
          configuration: challengeConfiguration,
          manifest: info.manifest,
          ...(metrics ? { metrics } : {}),
        };
        setLoadedChallengeRun({
          source: "recorded",
          label: targetRun.label,
          evidence,
          configSha256: info.manifest.simulator.configSha256,
        });
        if (targetRunId === "bank-conflict") setBaselineEvidence(evidence);
        if (targetRunId === "bank-improved") setImprovedEvidence(evidence);
        setNotice(
          `已加载 ${targetRun.label} 录制回放：${info.manifest.eventCount} 个真实事件。`,
        );
      } catch (error) {
        if (client && traceClient.current === client) {
          closeTrace();
          setNotice(
            error instanceof Error ? error.message : "无法加载 Trace bundle。",
          );
        } else {
          await client?.close();
        }
      }
    },
    [closeTrace, recordedRunId],
  );

  useEffect(() => {
    void loadRecordedTrace();
  }, [loadRecordedTrace]);

  useEffect(() => {
    let active = true;
    const baselineRun = RECORDED_RUNS.find(
      (run) => run.id === "bank-conflict",
    )!;
    const improvedRun = RECORDED_RUNS.find(
      (run) => run.id === "bank-improved",
    )!;
    void Promise.all([
      loadRecordedEvidence(baselineRun),
      loadRecordedEvidence(improvedRun),
    ])
      .then(([baseline, improved]) => {
        if (!active) return;
        setBaselineEvidence(baseline);
        setImprovedEvidence(improved);
      })
      .catch(() => {
        // Optional static evidence remains insufficient until its files exist.
      });
    return () => {
      active = false;
    };
  }, []);

  const launchSimulation = useCallback(async () => {
    if (runnerConnection !== "connected") return;
    setRunnerDiagnostic(undefined);
    try {
      const exported = await runnerClient.current.exportConfiguration({
        backendId: selectedRunConfiguration.backendId,
        workloadId: selectedRunConfiguration.workloadId,
        scenarioId: selectedRunConfiguration.scenarioId,
        parameters: selectedRunConfiguration.parameters,
      });
      setExportedConfiguration(exported);
      const job = await runnerClient.current.startJob(exported);
      setRunnerJob(job);
      loadedRunnerJobId.current = undefined;
      setNotice(`本地仿真 ${job.id.slice(0, 8)} 已启动。`);
    } catch (error) {
      setRunnerDiagnostic(
        error instanceof Error ? error.message : "无法启动本地仿真。",
      );
    }
  }, [runnerConnection, selectedRunConfiguration]);

  const loadRunnerResult = useCallback(
    async (job: RunnerJob) => {
      if (!job.result) return;
      closeTrace();
      setNotice(`正在校验并加载本地运行 ${job.id.slice(0, 8)}…`);
      let client: TraceWorkerClient | undefined;
      const loadRequestId = ++traceRequestId.current;
      try {
        client = TraceWorkerClient.spawn();
        traceClient.current = client;
        const [info, nextCatalog] = await Promise.all([
          client.load({
            kind: "http-directory",
            baseUrl: runnerClient.current.bundleBaseUrl(job.result),
          }),
          loadBundledCatalog(),
        ]);
        if (loadRequestId !== traceRequestId.current) {
          await client.close();
          return;
        }
        const nextDiagnostics = validateArchitectureTopology(
          info.topology,
          CORE_CATALOG,
        );
        if (nextDiagnostics.length > 0) {
          throw new Error(
            `Runner topology 校验失败：${nextDiagnostics[0]!.path} ${nextDiagnostics[0]!.message}`,
          );
        }
        const catalogDiagnostics = validateDavinciCatalogMapping(nextCatalog);
        if (catalogDiagnostics.length > 0) {
          throw new Error(
            `H3 目录校验失败：${catalogDiagnostics[0]!.path} ${catalogDiagnostics[0]!.message}`,
          );
        }
        const firstCycle = info.manifest.window.firstCycle;
        const preferred = 305n;
        const initialCycle =
          preferred >= BigInt(firstCycle) &&
          preferred <= BigInt(info.manifest.window.lastCycle)
            ? String(preferred)
            : firstCycle;
        const requestId = ++traceRequestId.current;
        const snapshot = await client.seek("core", initialCycle, requestId);
        const evidence: ChallengeRunEvidence = {
          configuration: job.configuration,
          manifest: info.manifest,
          ...(job.result.metrics ? { metrics: job.result.metrics } : {}),
        };
        setTopology(info.topology);
        setCatalog(nextCatalog);
        setTraceInfo(info);
        setTraceSnapshot(snapshot);
        setTraceCycle(initialCycle);
        setCycleDraft(initialCycle);
        setSelectedNodeId(undefined);
        setSelectedCandidateId(undefined);
        setBrowserMode("topology");
        setLoadedChallengeRun({
          source: "runner",
          label: `Run ${job.id.slice(0, 8)}`,
          evidence,
          configSha256: job.configSha256,
        });
        const banks = job.configuration.parameters.cubeMaxBankPerCycle;
        if (job.configuration.scenarioId === "bank-conflict" && banks === 1) {
          setBaselineEvidence(evidence);
        } else if (
          job.configuration.scenarioId === "bank-conflict" &&
          typeof banks === "number" &&
          banks >= 2
        ) {
          setImprovedEvidence(evidence);
        }
        setNotice(
          `已加载本地运行 ${job.id.slice(0, 8)}：${info.manifest.eventCount} 个事件。`,
        );
      } catch (error) {
        if (client && traceClient.current === client) closeTrace();
        else await client?.close();
        setRunnerDiagnostic(
          error instanceof Error ? error.message : "Runner bundle 加载失败。",
        );
      }
    },
    [closeTrace],
  );

  useEffect(() => {
    if (!runnerJob || !["running", "cancelling"].includes(runnerJob.status)) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runnerClient.current
        .getJob(runnerJob.id)
        .then(setRunnerJob)
        .catch((error: unknown) =>
          setRunnerDiagnostic(
            error instanceof Error ? error.message : "Runner 状态查询失败。",
          ),
        );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [runnerJob]);

  useEffect(() => {
    if (
      runnerJob?.status === "succeeded" &&
      runnerJob.result &&
      loadedRunnerJobId.current !== runnerJob.id
    ) {
      loadedRunnerJobId.current = runnerJob.id;
      void loadRunnerResult(runnerJob);
    }
  }, [loadRunnerResult, runnerJob]);

  const cancelSimulation = useCallback(async () => {
    if (!runnerJob || !["running", "cancelling"].includes(runnerJob.status)) {
      return;
    }
    try {
      setRunnerJob(await runnerClient.current.cancelJob(runnerJob.id));
    } catch (error) {
      setRunnerDiagnostic(
        error instanceof Error ? error.message : "无法取消本地仿真。",
      );
    }
  }, [runnerJob]);

  const stepTrace = useCallback(
    (delta: -1 | 1) => {
      if (!traceInfo) return;
      const first = BigInt(traceInfo.manifest.window.firstCycle);
      const last = BigInt(traceInfo.manifest.window.lastCycle);
      const next = BigInt(traceCycle) + BigInt(delta);
      const clamped = next < first ? first : next > last ? last : next;
      void seekTrace(String(clamped));
    },
    [seekTrace, traceCycle, traceInfo],
  );

  useEffect(() => {
    if (!tracePlaying || !traceInfo) return;
    const timer = window.setTimeout(
      () => {
        const last = BigInt(traceInfo.manifest.window.lastCycle);
        const current = BigInt(traceCycle);
        if (current >= last) {
          setTracePlaying(false);
          return;
        }
        void seekTrace(String(current + 1n));
      },
      Math.max(80, 650 / playbackSpeed),
    );
    return () => window.clearTimeout(timer);
  }, [playbackSpeed, seekTrace, traceCycle, traceInfo, tracePlaying]);

  return (
    <main className="game-shell">
      <header className="command-bar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            LS
          </span>
          <div>
            <strong>LinxSimCity</strong>
            <span>拓扑驱动芯片城市</span>
          </div>
        </div>
        <div className="run-identity" aria-label="Current topology identity">
          <span>{topology?.name ?? "Loading topology"}</span>
          <code>{world?.topologyFingerprint.slice(-8) ?? "loading"}</code>
          <span className={diagnostics.length === 0 ? "valid" : "invalid"}>
            {!topology
              ? "加载中"
              : diagnostics.length === 0
                ? "拓扑有效"
                : `${diagnostics.length} 个问题`}
          </span>
        </div>
        <div className="command-actions">
          <button type="button" onClick={() => importInput.current?.click()}>
            导入拓扑
          </button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="导入拓扑"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importTopology(file);
            }}
          />
          <button type="button" onClick={() => void loadDefault()}>
            重新生成
          </button>
          <label className="recorded-run-picker">
            <span>Run</span>
            <select
              value={recordedRunId}
              onChange={(event) =>
                setRecordedRunId(event.target.value as RecordedRunId)
              }
            >
              {RECORDED_RUNS.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="run-button"
            disabled={
              runnerJob?.status === "running" ||
              runnerJob?.status === "cancelling"
            }
            onClick={() =>
              runnerConnection === "connected"
                ? void launchSimulation()
                : void loadRecordedTrace()
            }
            title={
              runnerConnection === "connected"
                ? "按当前挑战配置启动本地 SuperScalarModel"
                : "加载随网页发布的只读录制回放"
            }
          >
            {runnerConnection === "connected"
              ? "重跑当前配置"
              : traceInfo
                ? "重新载入录制回放"
                : "载入录制回放"}
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="topology-panel" aria-label="拓扑组件">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {browserMode === "topology" ? "TOPOLOGY" : "H3 CATALOG"}
              </span>
              <h1>
                {browserMode === "topology" ? "拓扑顺序" : "DavinciOO 目录"}
              </h1>
            </div>
            <span className="count">
              {browserMode === "topology"
                ? (topologyView?.visibleNodeIds.size ?? 0)
                : (catalog?.candidates.length ?? 0)}
            </span>
          </div>
          <div
            className="browser-tabs"
            role="tablist"
            aria-label="浏览数据来源"
          >
            <button
              type="button"
              role="tab"
              aria-selected={browserMode === "topology"}
              className={browserMode === "topology" ? "active" : ""}
              onClick={() => {
                setBrowserMode("topology");
                setFilter("");
                setSelectedCandidateId(undefined);
                setLocatedOwnerId(undefined);
              }}
            >
              运行拓扑
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={browserMode === "catalog"}
              className={browserMode === "catalog" ? "active" : ""}
              onClick={() => {
                setBrowserMode("catalog");
                setFilter("");
                setSelectedNodeId(undefined);
                setLocatedOwnerId(undefined);
              }}
            >
              H3 目录
            </button>
          </div>
          <div className="topology-search">
            <label htmlFor="topology-filter">
              {browserMode === "topology" ? "搜索运行节点" : "搜索 240 项候选"}
            </label>
            <input
              id="topology-filter"
              type="search"
              value={filter}
              placeholder="ID、类型或名称"
              onChange={(event) => {
                setFilter(event.target.value);
                setLocatedOwnerId(undefined);
              }}
            />
          </div>
          {browserMode === "topology" ? (
            <div className="hierarchy-controls" aria-label="层级深度切片">
              <span>层级</span>
              <div>
                {DEPTH_SLICES.map((slice) => (
                  <button
                    type="button"
                    key={slice.id}
                    className={
                      topologyViewPreferences.depthSlice === slice.id
                        ? "active"
                        : ""
                    }
                    aria-pressed={
                      topologyViewPreferences.depthSlice === slice.id
                    }
                    onClick={() => setDepthSlice(slice.id)}
                    title={
                      slice.id === "leaf"
                        ? "只显示没有子节点的模块"
                        : slice.id === "all"
                          ? "显示全部层级"
                          : `显示到 ${slice.label} 层`
                    }
                  >
                    {slice.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="topology-list">
            {browserMode === "topology"
              ? visibleNodes.map(({ node, depth, hasChildren, expanded }) => {
                  const definition = CORE_BRICK_BY_ID.get(node.definitionId);
                  const instance = worldInstanceById.get(node.id);
                  const connections = topology
                    ? nodeConnections(topology, node.id)
                    : { incoming: [], outgoing: [] };
                  return (
                    <div
                      key={node.id}
                      className="topology-tree-row"
                      style={{ paddingLeft: `${Math.min(depth, 5) * 12}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          className="tree-toggle"
                          aria-label={`${expanded ? "折叠" : "展开"} ${node.label ?? node.id}`}
                          aria-expanded={expanded}
                          onClick={() => toggleTopologyNode(node.id)}
                        >
                          {expanded ? "−" : "+"}
                        </button>
                      ) : (
                        <span className="tree-toggle-placeholder" />
                      )}
                      <button
                        type="button"
                        className={[
                          "topology-node",
                          selectedNodeId === node.id ? "active" : "",
                          topologyView?.focusedNodeIds.has(node.id)
                            ? "path-node"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          setSelectedCandidateId(undefined);
                        }}
                      >
                        <span
                          className={`node-mark kind-${definition?.kind ?? "unknown"}`}
                        />
                        <span>
                          <strong>{node.label ?? node.id}</strong>
                          <small>
                            L{depth} ·{" "}
                            {definition?.kind === "queue"
                              ? "PIPE"
                              : instance
                                ? `R${instance.topologyRank} · ${instance.laneId}`
                                : "CONTAINER"}
                          </small>
                        </span>
                        <span className="edge-count">
                          {connections.incoming.length}↓{" "}
                          {connections.outgoing.length}↑
                        </span>
                      </button>
                    </div>
                  );
                })
              : catalogTree.map((district) => {
                  const districtExpanded =
                    catalogSearchActive || expandedCatalogH1.has(district.id);
                  return (
                    <section className="catalog-district" key={district.id}>
                      <button
                        type="button"
                        className="catalog-branch catalog-h1"
                        aria-expanded={districtExpanded}
                        onClick={() => toggleCatalogBranch("h1", district.id)}
                      >
                        <span className="catalog-chevron" aria-hidden="true">
                          {districtExpanded ? "−" : "+"}
                        </span>
                        <span>
                          <strong>{district.label}</strong>
                          <small>H1 城区</small>
                        </span>
                        <span className="catalog-count">
                          {district.candidateCount}
                        </span>
                      </button>
                      {districtExpanded
                        ? district.subsystems.map((subsystem) => {
                            const subsystemExpanded =
                              catalogSearchActive ||
                              expandedCatalogH2.has(subsystem.id);
                            return (
                              <div
                                className="catalog-subsystem"
                                key={subsystem.id}
                              >
                                <button
                                  type="button"
                                  className="catalog-branch catalog-h2"
                                  aria-expanded={subsystemExpanded}
                                  onClick={() =>
                                    toggleCatalogBranch("h2", subsystem.id)
                                  }
                                >
                                  <span
                                    className="catalog-chevron"
                                    aria-hidden="true"
                                  >
                                    {subsystemExpanded ? "−" : "+"}
                                  </span>
                                  <span>
                                    <strong>{subsystem.label}</strong>
                                    <small>H2 子系统</small>
                                  </span>
                                  <span className="catalog-count">
                                    {subsystem.candidates.length}
                                  </span>
                                </button>
                                {subsystemExpanded ? (
                                  <div className="catalog-candidates">
                                    {subsystem.candidates.map((candidate) => (
                                      <button
                                        type="button"
                                        key={candidate.candidateId}
                                        ref={(element) => {
                                          if (element) {
                                            catalogCandidateElements.current.set(
                                              candidate.candidateId,
                                              element,
                                            );
                                          } else {
                                            catalogCandidateElements.current.delete(
                                              candidate.candidateId,
                                            );
                                          }
                                        }}
                                        className={[
                                          "topology-node",
                                          "catalog-node",
                                          selectedCandidateId ===
                                          candidate.candidateId
                                            ? "active"
                                            : "",
                                          locatedOwnerId ===
                                          candidate.candidateId
                                            ? "owner-target"
                                            : "",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                        onClick={() => {
                                          setSelectedCandidateId(
                                            candidate.candidateId,
                                          );
                                          setSelectedNodeId(undefined);
                                          setLocatedOwnerId(undefined);
                                        }}
                                      >
                                        <span
                                          className={`node-mark representation-${candidate.representation}`}
                                        />
                                        <span>
                                          <strong>
                                            {candidate.h3} · {candidate.name}
                                          </strong>
                                          <small>{candidate.candidateId}</small>
                                          <span className="candidate-statuses">
                                            <i>{candidate.representation}</i>
                                            <i>
                                              {
                                                candidate.dispositionRecommendation
                                              }
                                            </i>
                                            <i
                                              className={`evidence-${candidate.observedEvidenceStatus}`}
                                            >
                                              {candidate.observedEvidenceStatus}
                                            </i>
                                          </span>
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        : null}
                    </section>
                  );
                })}
            {browserMode === "catalog" && visibleCandidateCount === 0 ? (
              <div className="catalog-empty">没有匹配的 H3 候选。</div>
            ) : null}
          </div>
          <div className="topology-summary">
            {browserMode === "topology" ? (
              <>
                <div>
                  <span>节点</span>
                  <strong>{topology?.nodes.length ?? 0}</strong>
                </div>
                <div>
                  <span>边</span>
                  <strong>{topology?.edges.length ?? 0}</strong>
                </div>
                <div>
                  <span>模块层</span>
                  <strong>
                    {orderedNodes.length > 0
                      ? Math.max(
                          ...orderedNodes.map(
                            ({ instance }) => instance.topologyRank,
                          ),
                        ) + 1
                      : 0}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span>H1</span>
                  <strong>{catalog?.summary.h1 ?? 0}</strong>
                </div>
                <div>
                  <span>H2</span>
                  <strong>{catalog?.summary.h2 ?? 0}</strong>
                </div>
                <div>
                  <span>H3</span>
                  <strong>{catalog?.summary.h3Candidates ?? 0}</strong>
                </div>
              </>
            )}
          </div>
        </aside>

        <section className="scene-panel" aria-label="拓扑生成的 3D 芯片城市">
          {world ? (
            <Suspense
              fallback={<div className="scene-loading">正在生成 3D 拓扑…</div>}
            >
              <WorldScene
                key={world.topologyFingerprint}
                className="scene-canvas"
                world={world}
                definitions={CORE_BRICK_BY_ID}
                activityByInstanceId={traceActivity}
                visibleInstanceIds={topologyView?.visibleNodeIds}
                focusedTopologyEdgeIds={topologyView?.focusedEdgeIds}
                selectedInstanceId={selectedNodeId}
                onSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedEntry(undefined);
                  setSelectedCandidateId(undefined);
                  setBrowserMode("topology");
                }}
                onSelectEntry={(instanceId, logicalIndex) => {
                  setSelectedNodeId(instanceId);
                  setSelectedEntry({ instanceId, logicalIndex });
                  setSelectedCandidateId(undefined);
                  setBrowserMode("topology");
                }}
                onBlank={() => {
                  setSelectedNodeId(undefined);
                  setSelectedEntry(undefined);
                  setSelectedCandidateId(undefined);
                }}
              />
            </Suspense>
          ) : loadError || diagnostics.length > 0 ? (
            <div className="scene-error" role="alert">
              <strong>无法生成场景</strong>
              <span>{loadError ?? diagnostics[0]?.message ?? "拓扑无效"}</span>
            </div>
          ) : (
            <div className="scene-loading">正在加载 pyCircuit 拓扑…</div>
          )}
          <div className="scene-mode">
            <span className="mode-light mode-topology" />
            Queue 折叠排序 · 尺寸感知布局 · SimQueue 管道
          </div>
          {!challengeOpen ? (
            <button
              type="button"
              className="challenge-launcher"
              onClick={() => setChallengeOpen(true)}
            >
              <span>CHALLENGES</span>
              <strong>{selectedEvaluation.status}</strong>
            </button>
          ) : null}
          {challengeOpen ? (
            <ChallengeConsole
              challengeId={selectedChallengeId}
              challenge={selectedChallenge}
              evaluation={selectedEvaluation}
              evaluations={challengeEvaluations}
              runnerConnection={runnerConnection}
              runnerCatalog={runnerCatalog}
              runnerDiagnostic={runnerDiagnostic}
              job={runnerJob}
              exportedConfiguration={exportedConfiguration}
              loadedRun={loadedChallengeRun}
              loadedRunStale={loadedRunStale}
              baselineEvidence={baselineEvidence}
              improvedEvidence={improvedEvidence}
              cubeMaxBankPerCycle={cubeMaxBankPerCycle}
              onClose={() => setChallengeOpen(false)}
              onSelectChallenge={(challengeId) => {
                setSelectedChallengeId(challengeId);
                setExportedConfiguration(undefined);
              }}
              onCubeMaxBankPerCycle={(value) => {
                setCubeMaxBankPerCycle(value);
                setExportedConfiguration(undefined);
              }}
              onConnect={() => void connectRunner(true)}
              onRun={() => void launchSimulation()}
              onCancel={() => void cancelSimulation()}
              onLoadRecorded={(runId) => {
                if (runId === recordedRunId) void loadRecordedTrace(runId);
                else setRecordedRunId(runId);
              }}
            />
          ) : null}
          {topologyView?.focusedEdgeIds.size ? (
            <div className="path-focus-banner">
              <span>
                PATH FOCUS · {topologyView.focusedEdgeIds.size} EDGE
                {topologyView.focusedEdgeIds.size === 1 ? "" : "S"}
              </span>
              <button type="button" onClick={() => focusTopologyEdges([])}>
                清除聚焦
              </button>
            </div>
          ) : null}
          <div className="scene-state-legend" aria-label="Entry state legend">
            <span>
              <i className="entry-swatch entry-occupied" /> 数据流动
            </span>
            <span>
              <i className="entry-swatch entry-empty" /> 空闲管道
            </span>
            <small>
              {traceInfo
                ? `TRACE · ${traceInfo.manifest.simulator.name.toUpperCase()} · ${recordedRun.shortLabel}`
                : "PREVIEW · 非仿真状态"}
            </small>
          </div>
          <div className="axis-readout" aria-label="World axes">
            <span className="axis-x">X</span>
            <span className="axis-y">Y</span>
            <span className="axis-z">Z</span>
          </div>
          {traceInfo ? (
            <div
              className="trace-playback"
              aria-label="Trace playback controls"
            >
              <button type="button" onClick={() => stepTrace(-1)}>
                −1
              </button>
              <button
                type="button"
                className="play-toggle"
                onClick={() => setTracePlaying((playing) => !playing)}
              >
                {tracePlaying ? "暂停" : "播放"}
              </button>
              <button type="button" onClick={() => stepTrace(1)}>
                +1
              </button>
              <label>
                Cycle
                <input
                  value={cycleDraft}
                  inputMode="numeric"
                  onChange={(event) => setCycleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void seekTrace(cycleDraft);
                  }}
                  onBlur={() => void seekTrace(cycleDraft)}
                />
              </label>
              <span>/ {traceInfo.manifest.window.lastCycle}</span>
              <label>
                Speed
                <select
                  value={playbackSpeed}
                  onChange={(event) =>
                    setPlaybackSpeed(Number(event.target.value))
                  }
                >
                  {[0.5, 1, 2, 4].map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}×
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="scene-notice" aria-live="polite">
            {notice}
          </div>
        </section>

        <aside className="inspector-panel" aria-label="拓扑节点检查器">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">INSPECTOR</span>
              <h2>
                {selectedCandidate?.name ?? selectedNode?.label ?? "未选择对象"}
              </h2>
            </div>
          </div>
          {selectedCandidate && catalog ? (
            <CatalogInspector
              candidate={selectedCandidate}
              entry={selectedCatalogEntry}
              catalog={catalog}
              onLocateOwner={locateCatalogOwner}
            />
          ) : selectedNode && selectedDefinition && world && topology ? (
            <NodeInspector
              node={selectedNode}
              definition={selectedDefinition}
              topology={topology}
              world={world}
              snapshot={traceSnapshot}
              selectedEntryLogicalIndex={
                selectedEntry?.instanceId === selectedNode.id
                  ? selectedEntry.logicalIndex
                  : undefined
              }
              onSelect={(nodeId) => {
                setSelectedNodeId(nodeId);
                setSelectedCandidateId(undefined);
              }}
              onFocusEdge={(edgeId) => focusTopologyEdges([edgeId])}
              onFocusAssociation={focusTraceAssociation}
            />
          ) : (
            <div className="empty-inspector">
              <div className="selection-reticle" aria-hidden="true" />
              <p>
                选择运行拓扑节点查看连接，或切换 H3 目录检查候选身份与状态。
              </p>
            </div>
          )}
          {diagnostics.length > 0 ? (
            <div className="diagnostics" role="alert">
              <strong>拓扑校验</strong>
              {diagnostics.slice(0, 4).map((item) => (
                <p key={`${item.path}:${item.code}`}>
                  {item.path}: {item.message}
                </p>
              ))}
            </div>
          ) : null}
        </aside>
      </div>

      <footer className="status-bar">
        <span>拖拽旋转 · 滚轮缩放 · 点击组件检查连接 · 点击空白取消选择</span>
        <span>
          <i className="status-dot" />{" "}
          {traceInfo
            ? `${traceInfo.manifest.simulator.name} trace · core cycle ${traceCycle}`
            : "管道光点为数据流预览 · Trace 未载入"}
        </span>
      </footer>
    </main>
  );
}

interface ChallengeConsoleProps {
  readonly challengeId: ChallengeId;
  readonly challenge: ChallengeDefinition;
  readonly evaluation: ChallengeEvaluation;
  readonly evaluations: Readonly<Record<ChallengeId, ChallengeEvaluation>>;
  readonly runnerConnection: RunnerConnection;
  readonly runnerCatalog: RunnerCatalog | undefined;
  readonly runnerDiagnostic: string | undefined;
  readonly job: RunnerJob | undefined;
  readonly exportedConfiguration: ExportedRunConfiguration | undefined;
  readonly loadedRun: LoadedChallengeRun | undefined;
  readonly loadedRunStale: boolean;
  readonly baselineEvidence: ChallengeRunEvidence | undefined;
  readonly improvedEvidence: ChallengeRunEvidence | undefined;
  readonly cubeMaxBankPerCycle: number;
  readonly onClose: () => void;
  readonly onSelectChallenge: (challengeId: ChallengeId) => void;
  readonly onCubeMaxBankPerCycle: (value: number) => void;
  readonly onConnect: () => void;
  readonly onRun: () => void;
  readonly onCancel: () => void;
  readonly onLoadRecorded: (runId: RecordedRunId) => void;
}

function MetricsCard({
  label,
  evidence,
}: {
  readonly label: string;
  readonly evidence: ChallengeRunEvidence | undefined;
}) {
  return (
    <div className="challenge-metrics-card">
      <strong>{label}</strong>
      {evidence?.metrics ? (
        <dl>
          {Object.entries(evidence.metrics.values).map(([metric, value]) => (
            <div key={metric}>
              <dt>{METRIC_LABELS[metric as ObservableMetricId] ?? metric}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="insufficient-metrics">insufficient-evidence</span>
      )}
    </div>
  );
}

function ChallengeConsole({
  challengeId,
  challenge,
  evaluation,
  evaluations,
  runnerConnection,
  runnerCatalog,
  runnerDiagnostic,
  job,
  exportedConfiguration,
  loadedRun,
  loadedRunStale,
  baselineEvidence,
  improvedEvidence,
  cubeMaxBankPerCycle,
  onClose,
  onSelectChallenge,
  onCubeMaxBankPerCycle,
  onConnect,
  onRun,
  onCancel,
  onLoadRecorded,
}: ChallengeConsoleProps) {
  const running = job?.status === "running" || job?.status === "cancelling";
  const recordedRunId: RecordedRunId =
    challengeId === "explain-topology" ? "normal" : "bank-conflict";
  const boundedJobDiagnostic = (
    job?.diagnostic ||
    job?.stderr ||
    job?.stdout ||
    ""
  )
    .replaceAll(/\s+/gu, " ")
    .slice(0, 480);
  return (
    <aside className="challenge-console" aria-label="挑战与本地仿真">
      <header>
        <div>
          <span className="eyebrow">CHALLENGES</span>
          <strong>验证任务</strong>
        </div>
        <button
          type="button"
          className={`runner-state runner-${runnerConnection}`}
          onClick={onConnect}
          disabled={runnerConnection === "connecting"}
          title={`本地 runner：${DEFAULT_RUNNER_BASE_URL}`}
        >
          {runnerConnection === "connected"
            ? `RUNNER · ${runnerCatalog?.scenarios.length ?? 0} SCENARIOS`
            : runnerConnection === "connecting"
              ? "CONNECTING"
              : "录制回放"}
        </button>
        <button
          type="button"
          className="challenge-close"
          onClick={onClose}
          aria-label="关闭挑战面板"
        >
          ×
        </button>
      </header>

      <div className="challenge-tabs" role="tablist">
        {CHALLENGE_LIST.map((item, index) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            aria-selected={challengeId === item.id}
            className={challengeId === item.id ? "active" : ""}
            onClick={() => onSelectChallenge(item.id)}
          >
            <span>0{index + 1}</span>
            <strong>{item.label}</strong>
            <i className={`evaluation-${evaluations[item.id].status}`}>
              {evaluations[item.id].status}
            </i>
          </button>
        ))}
      </div>

      <div className="challenge-body">
        <p className="challenge-objective">{challenge.objective}</p>
        <section>
          <h3>步骤</h3>
          <ol>
            {challenge.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <section>
          <h3>证据要求</h3>
          <p>{challenge.completion.description}</p>
          <div className="evidence-tags">
            {challenge.requiredTraceCapabilities.map((capability) => (
              <code key={capability}>{capability}</code>
            ))}
            {challenge.completion.requiredMetrics.map((metric) => (
              <code key={metric}>{METRIC_LABELS[metric]}</code>
            ))}
          </div>
        </section>

        {challengeId === "reduce-bank-conflicts" ? (
          <label className="bank-control">
            <span>Cube banks / cycle</span>
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={cubeMaxBankPerCycle}
              onChange={(event) =>
                onCubeMaxBankPerCycle(Number(event.target.value))
              }
            />
            <strong>{cubeMaxBankPerCycle}</strong>
          </label>
        ) : null}

        <div className="challenge-actions">
          {runnerConnection === "connected" ? (
            <button type="button" onClick={onRun} disabled={running}>
              {running ? "仿真运行中" : "重跑当前配置"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onLoadRecorded(recordedRunId)}
              >
                {challengeId === "reduce-bank-conflicts"
                  ? "Baseline ×1"
                  : "加载录制回放"}
              </button>
              {challengeId === "reduce-bank-conflicts" ? (
                <button
                  type="button"
                  onClick={() => onLoadRecorded("bank-improved")}
                >
                  Improved ×2
                </button>
              ) : null}
            </>
          )}
          {running ? (
            <button type="button" className="cancel-run" onClick={onCancel}>
              取消
            </button>
          ) : null}
        </div>

        {exportedConfiguration ? (
          <div className="configuration-proof">
            <span>CONFIG</span>
            <code>{exportedConfiguration.configSha256.slice(0, 12)}</code>
            <small>
              {exportedConfiguration.simulatorOverrides.join(" · ")}
            </small>
          </div>
        ) : null}
        {job ? (
          <div className={`job-status job-${job.status}`}>
            <span>{job.status}</span>
            <code>{job.id.slice(0, 12)}</code>
            {boundedJobDiagnostic ? (
              <small>{boundedJobDiagnostic}</small>
            ) : null}
          </div>
        ) : null}
        {runnerDiagnostic ? (
          <p className="runner-diagnostic">{runnerDiagnostic.slice(0, 480)}</p>
        ) : null}

        <div className={`loaded-run-binding ${loadedRunStale ? "stale" : ""}`}>
          <span>
            {loadedRun?.source === "runner" ? "LIVE RUN" : "RECORDED"}
          </span>
          <strong>{loadedRun?.label ?? "No run loaded"}</strong>
          <code>{loadedRun?.configSha256.slice(0, 12) ?? "—"}</code>
          {loadedRunStale ? (
            <small>STALE · 配置已改变，此画面不是当前改进结果</small>
          ) : null}
        </div>

        <div className="evaluation-result">
          <span>完成状态</span>
          <strong className={`evaluation-${evaluation.status}`}>
            {evaluation.status}
          </strong>
          {evaluation.diagnostics.slice(0, 3).map((diagnostic) => (
            <small key={diagnostic}>{diagnostic}</small>
          ))}
        </div>

        {challengeId === "reduce-bank-conflicts" ? (
          <div className="metrics-comparison">
            <MetricsCard label="BASELINE" evidence={baselineEvidence} />
            <MetricsCard label="IMPROVED" evidence={improvedEvidence} />
          </div>
        ) : (
          <MetricsCard
            label="OBSERVED METRICS"
            evidence={loadedRun?.evidence}
          />
        )}
      </div>
    </aside>
  );
}

interface CatalogInspectorProps {
  readonly candidate: DavinciCandidateMapping;
  readonly entry: DavinciCatalogIndexEntry | undefined;
  readonly catalog: DavinciCatalogMapping;
  readonly onLocateOwner: (candidateId: string) => void;
}

function CatalogInspector({
  candidate,
  entry,
  catalog,
  onLocateOwner,
}: CatalogInspectorProps) {
  return (
    <div className="inspector-content">
      <div className="identity-block">
        <span>H3 candidate ID</span>
        <code>{candidate.candidateId}</code>
      </div>
      <div className="source-provenance catalog-provenance">
        <span>pyCircuit · committed catalog</span>
        <code>{catalog.source.revision.slice(0, 12)}</code>
        <strong>目录映射，不是执行拓扑</strong>
      </div>

      <section>
        <h3>层次路径</h3>
        <div className="hierarchy-path">
          {candidate.h1} › {candidate.h2} › {candidate.h3}
        </div>
      </section>

      <section>
        <h3>候选状态</h3>
        <div className="parameter-list">
          <div>
            <span>表示</span>
            <strong>{candidate.representation}</strong>
          </div>
          <div>
            <span>推荐处置</span>
            <strong>{candidate.dispositionRecommendation}</strong>
          </div>
          <div>
            <span>快照执行状态</span>
            <strong>{candidate.reportedExecutionStatus}</strong>
          </div>
          <div>
            <span>源码存在</span>
            <strong>{candidate.sourcePresentAtRevision ? "yes" : "no"}</strong>
          </div>
          <div>
            <span>Git tree 证据</span>
            <strong>{candidate.observedEvidenceStatus}</strong>
          </div>
          <div>
            <span>测试路径</span>
            <strong>{candidate.testPathsAtRevision.length}</strong>
          </div>
          <div>
            <span>owner</span>
            <strong>
              {entry?.owner.canonicalOwnerCandidateId ?? "unresolved"}
            </strong>
          </div>
          <div>
            <span>UI representation</span>
            <strong>{entry?.capability.presentation ?? "unresolved"}</strong>
          </div>
          <div>
            <span>执行能力</span>
            <strong>
              {entry?.capability.executionCapability ??
                "not-established-by-catalog"}
            </strong>
          </div>
        </div>
        {entry?.owner.canonicalOwnerCandidateId ? (
          <button
            type="button"
            className="locate-owner"
            onClick={() =>
              onLocateOwner(entry.owner.canonicalOwnerCandidateId!)
            }
          >
            定位 canonical owner
          </button>
        ) : (
          <p className="owner-unresolved">Canonical owner 尚未解析</p>
        )}
      </section>

      <section>
        <h3>物理面积</h3>
        <div className={`area-record area-${candidate.area.status}`}>
          <span>{candidate.area.status}</span>
          <strong>
            {candidate.area.value === null
              ? "Unknown"
              : `${candidate.area.value.toLocaleString()} µm²`}
          </strong>
          <small>{candidate.area.source}</small>
        </div>
      </section>

      <section>
        <h3>设计判断</h3>
        <p className="catalog-rationale">{candidate.rationale}</p>
      </section>

      <section>
        <h3>接口证据</h3>
        <div className="catalog-port-list">
          {candidate.inputs.map((port) => (
            <div key={`in:${port.name}`}>
              <span className="direction incoming">IN</span>
              <span>
                <strong>{port.name}</strong>
                <small>
                  {port.type} · {port.evidenceStatus}
                </small>
              </span>
            </div>
          ))}
          {candidate.outputs.map((port) => (
            <div key={`out:${port.name}`}>
              <span className="direction outgoing">OUT</span>
              <span>
                <strong>{port.name}</strong>
                <small>
                  {port.type} · {port.evidenceStatus}
                </small>
              </span>
            </div>
          ))}
          {candidate.inputs.length + candidate.outputs.length === 0 ? (
            <p className="muted">该项没有独立端口。</p>
          ) : null}
        </div>
      </section>

      <section>
        <h3>来源路径</h3>
        <div className="source-paths">
          <code>{candidate.card}</code>
          <code>{candidate.proposedSource}</code>
        </div>
      </section>
    </div>
  );
}

interface NodeInspectorProps {
  readonly node: TopologyNode;
  readonly definition: BrickDefinition;
  readonly topology: ArchitectureTopology;
  readonly world: ReturnType<typeof generateWorldFromTopology>;
  readonly snapshot?: SimTraceSnapshot | undefined;
  readonly selectedEntryLogicalIndex?: number | undefined;
  readonly onSelect: (nodeId: string) => void;
  readonly onFocusEdge: (edgeId: string) => void;
  readonly onFocusAssociation: (
    entityNodeId: string,
    storageNodeId: string,
  ) => void;
}

function NodeInspector({
  node,
  definition,
  topology,
  world,
  snapshot,
  selectedEntryLogicalIndex,
  onSelect,
  onFocusEdge,
  onFocusAssociation,
}: NodeInspectorProps) {
  const instance = world.instances.find((item) => item.id === node.id)!;
  const position = positionToTuple(instance.transform.position);
  const connections = nodeConnections(topology, node.id);
  const queueState = snapshot?.queues.find((item) => item.queueId === node.id);
  const residencies = snapshot?.tileResidencies.filter(
    (item) => item.storageNodeId === node.id,
  );
  const associatedTiles = snapshot?.associations.filter(
    (item) =>
      item.entityId === node.id ||
      (residencies ?? []).some(
        (residency) =>
          residency.tileId === item.tileId &&
          residency.version === item.version,
      ),
  );
  const relatedResidencies = snapshot?.tileResidencies.filter((residency) =>
    (associatedTiles ?? []).some(
      (item) =>
        item.tileId === residency.tileId && item.version === residency.version,
    ),
  );
  const storageAssociations = snapshot?.associations.filter((item) =>
    (residencies ?? []).some(
      (residency) =>
        residency.tileId === item.tileId && residency.version === item.version,
    ),
  );
  const selectedMemoryLocation =
    selectedEntryLogicalIndex !== undefined &&
    definition.visual.profile === "memory-banks"
      ? {
          bank: Math.floor(
            selectedEntryLogicalIndex /
              Math.max(1, instance.parameters.rows ?? 1),
          ),
          row:
            selectedEntryLogicalIndex %
            Math.max(1, instance.parameters.rows ?? 1),
        }
      : undefined;
  return (
    <div className="inspector-content">
      <div className="identity-block">
        <span>稳定拓扑 ID</span>
        <code>{node.id}</code>
      </div>
      {selectedEntryLogicalIndex !== undefined ? (
        <section>
          <h3>选中 Entry</h3>
          <div className="parameter-list">
            <div>
              <span>logical index</span>
              <strong>{selectedEntryLogicalIndex}</strong>
            </div>
            {definition.visual.profile === "memory-banks" ? (
              <div>
                <span>physical location</span>
                <strong>
                  B{selectedMemoryLocation?.bank ?? "?"}/R
                  {selectedMemoryLocation?.row ?? "?"}
                </strong>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {topology.source ? (
        <div className="source-provenance">
          <span>pyCircuit · QueueGraph {topology.source.planVersion}</span>
          <code>{topology.source.revision.slice(0, 12)}</code>
          <strong>
            {topology.source.relevantInputsDirty
              ? "相关输入有修改"
              : "相关输入已固定"}
          </strong>
        </div>
      ) : null}
      <div className="position-grid">
        <div>
          <span>X</span>
          <strong>{position[0]}</strong>
        </div>
        <div>
          <span>Y</span>
          <strong>{position[1]}</strong>
        </div>
        <div>
          <span>Z</span>
          <strong>{position[2]}</strong>
        </div>
        <div>
          <span>深度</span>
          <strong>L{instance.hierarchyDepth}</strong>
        </div>
      </div>

      <section>
        <h3>层次路径</h3>
        <div className="hierarchy-path">{topologyNodePath(topology, node)}</div>
      </section>

      <section>
        <h3>物理面积</h3>
        <div className={`area-record area-${node.area.status}`}>
          <span>{node.area.status}</span>
          <strong>
            {node.area.value === null
              ? "Unknown"
              : `${node.area.value.toLocaleString()} µm²`}
          </strong>
          <small>{node.area.source}</small>
        </div>
      </section>

      <section>
        <h3>模型信息</h3>
        <div className="parameter-list">
          <div>
            <span>definition</span>
            <strong>{definition.id}</strong>
          </div>
          <div>
            <span>visual profile</span>
            <strong>{definition.visual.profile}</strong>
          </div>
          {Object.entries(node.attributes ?? {}).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
      </section>

      {snapshot ? (
        <section>
          <h3>回放状态</h3>
          <div className="parameter-list">
            <div>
              <span>core cycle</span>
              <strong>
                {snapshot.positions.find((item) => item.timeDomain === "core")
                  ?.cycle ?? "unknown"}
              </strong>
            </div>
            {queueState ? (
              <>
                <div>
                  <span>Queue occupancy</span>
                  <strong>
                    {queueState.occupancy}/{queueState.capacity}
                  </strong>
                </div>
                <div>
                  <span>Backpressure</span>
                  <strong>
                    {queueState.backpressure.active
                      ? queueState.backpressure.reason
                      : "none"}
                  </strong>
                </div>
                {queueState.tokens.map((token) => (
                  <div key={token.tokenId}>
                    <span>{token.tokenId}</span>
                    <strong>
                      {token.state} · slot {token.slot ?? "pending"}
                    </strong>
                  </div>
                ))}
              </>
            ) : null}
            {(residencies ?? []).map((item) => (
              <div key={item.residencyId}>
                <span>{item.tileId}</span>
                <strong>
                  v{item.version} · B{item.bank ?? "?"}/R{item.row ?? "?"}/S
                  {item.slot ?? "?"}
                </strong>
              </div>
            ))}
          </div>
          {(relatedResidencies ?? []).length > 0 ? (
            <div className="connection-list trace-association-list">
              {relatedResidencies?.map((item) => (
                <button
                  type="button"
                  key={item.residencyId}
                  onClick={() => {
                    onFocusAssociation(node.id, item.storageNodeId);
                    onSelect(item.storageNodeId);
                  }}
                >
                  <span className="direction outgoing">TILE</span>
                  <span>
                    <strong>{item.tileId}</strong>
                    <small>
                      {
                        associatedTiles?.find(
                          (association) =>
                            association.tileId === item.tileId &&
                            association.version === item.version,
                        )?.tokenId
                      }{" "}
                      → {item.storageNodeId} · v{item.version} · B
                      {item.bank ?? "?"}/R
                      {item.row ?? "?"}/S{item.slot ?? "?"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {(storageAssociations ?? []).length > 0 ? (
            <div className="connection-list trace-association-list">
              {storageAssociations?.map((item) => (
                <button
                  type="button"
                  key={`${item.entityId}:${item.tokenId}:${item.tileId}`}
                  onClick={() => {
                    onFocusAssociation(item.entityId, node.id);
                    onSelect(item.entityId);
                  }}
                >
                  <span className="direction incoming">TOKEN</span>
                  <span>
                    <strong>{item.tokenId}</strong>
                    <small>
                      {item.entityId} → {item.tileId} v{item.version}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h3>参数</h3>
        <div className="parameter-list">
          {Object.entries(instance.parameters).length === 0 ? (
            <p className="muted">该节点没有参数。</p>
          ) : (
            Object.entries(instance.parameters).map(([key, value]) => (
              <div key={key}>
                <span>{definition.parameters[key]?.label ?? key}</span>
                <strong>{value}</strong>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h3>拓扑连接</h3>
        <div className="connection-list">
          {connections.incoming.map((edge) => (
            <button
              type="button"
              key={edge.id}
              onClick={() => {
                onFocusEdge(edge.id);
                onSelect(edge.from.nodeId);
              }}
            >
              <span className="direction incoming">IN</span>
              <span>
                <strong>{edge.from.nodeId}</strong>
                <small>
                  {edge.from.portId} → {edge.to.portId}
                </small>
              </span>
            </button>
          ))}
          {connections.outgoing.map((edge) => (
            <button
              type="button"
              key={edge.id}
              onClick={() => {
                onFocusEdge(edge.id);
                onSelect(edge.to.nodeId);
              }}
            >
              <span className="direction outgoing">OUT</span>
              <span>
                <strong>{edge.to.nodeId}</strong>
                <small>
                  {edge.from.portId} → {edge.to.portId}
                </small>
              </span>
            </button>
          ))}
          {connections.incoming.length + connections.outgoing.length === 0 ? (
            <p className="muted">该节点没有外部拓扑边。</p>
          ) : null}
        </div>
      </section>

      <section>
        <h3>端口定义</h3>
        <div className="port-list">
          {definition.ports.map((port) => (
            <div key={port.id}>
              <span className={`port-dot port-${port.direction}`} />
              <span>
                <strong>{port.label}</strong>
                <small>
                  {port.protocol} · {port.widthBits ?? "topology"}
                  {port.widthBits === null ? " width" : " bit"}
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
