import {
  CORE_BRICK_BY_ID,
  CORE_CATALOG,
  validateDavinciCatalogMapping,
} from "@linxsimcity/component-catalog";
import type {
  BrickDefinition,
  DavinciCandidateMapping,
  DavinciCatalogMapping,
} from "@linxsimcity/component-catalog";
import type { BrickActivity } from "@linxsimcity/brick-kit";
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
import "./styles.css";

const WorldScene = lazy(async () => {
  const module = await import("@linxsimcity/brick-kit");
  return { default: module.WorldScene };
});

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

export function App() {
  const [topology, setTopology] = useState<ArchitectureTopology>();
  const [catalog, setCatalog] = useState<DavinciCatalogMapping>();
  const [browserMode, setBrowserMode] = useState<"topology" | "catalog">(
    "topology",
  );
  const [loadError, setLoadError] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>();
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("正在加载 pyCircuit QueueGraph 拓扑…");
  const [traceInfo, setTraceInfo] = useState<LoadedTraceInfo>();
  const [traceSnapshot, setTraceSnapshot] = useState<SimTraceSnapshot>();
  const [traceCycle, setTraceCycle] = useState("0");
  const [cycleDraft, setCycleDraft] = useState("0");
  const [tracePlaying, setTracePlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const importInput = useRef<HTMLInputElement>(null);
  const traceClient = useRef<TraceWorkerClient | undefined>(undefined);
  const traceRequestId = useRef(0);
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
        activity.set(instance.id, {
          source: "trace",
          occupiedEntries: residencies.length,
          headIndex: 0,
          activeEntryIndices: [
            ...new Set(
              residencies.flatMap((item) =>
                item.bank === undefined
                  ? item.slot === undefined
                    ? []
                    : [item.slot]
                  : [item.bank],
              ),
            ),
          ],
          labels: residencies.map(
            (item) =>
              `${item.tileId}@${item.bank === undefined ? "slot" : `B${item.bank}`}`,
          ),
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
  const visibleNodes = orderedNodes.filter(({ node }) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    const definition = CORE_BRICK_BY_ID.get(node.definitionId);
    return [node.id, node.label, definition?.label, definition?.kind]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
  const visibleCandidates = (catalog?.candidates ?? []).filter((candidate) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    return [
      candidate.candidateId,
      candidate.h1,
      candidate.h2,
      candidate.h3,
      candidate.name,
      candidate.representation,
    ].some((value) => value.toLowerCase().includes(query));
  });

  const closeTrace = useCallback(() => {
    const client = traceClient.current;
    traceClient.current = undefined;
    traceRequestId.current += 1;
    setTraceInfo(undefined);
    setTraceSnapshot(undefined);
    setTracePlaying(false);
    setTraceCycle("0");
    setCycleDraft("0");
    void client?.close();
  }, []);

  useEffect(
    () => () => {
      void traceClient.current?.close();
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

  useEffect(() => {
    void loadDefault();
  }, [loadDefault]);

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

  const loadRecordedTrace = useCallback(async () => {
    closeTrace();
    setNotice("正在 Worker 中加载 current synthetic bundle…");
    try {
      const client = TraceWorkerClient.spawn();
      traceClient.current = client;
      const baseUrl = new URL(
        `${import.meta.env.BASE_URL}runs/minimal.bundle`,
        window.location.href,
      ).href;
      const info = await client.load({ kind: "http-directory", baseUrl });
      const nextDiagnostics = validateArchitectureTopology(
        info.topology,
        CORE_CATALOG,
      );
      if (nextDiagnostics.length > 0) {
        throw new Error(
          `Trace topology 校验失败：${nextDiagnostics[0]!.path} ${nextDiagnostics[0]!.message}`,
        );
      }
      setTopology(info.topology);
      setTraceInfo(info);
      setSelectedNodeId(undefined);
      setSelectedCandidateId(undefined);
      setBrowserMode("topology");
      const firstCycle = info.manifest.window.firstCycle;
      const requestId = ++traceRequestId.current;
      const snapshot = await client.seek("core", firstCycle, requestId);
      setTraceSnapshot(snapshot);
      setTraceCycle(firstCycle);
      setCycleDraft(firstCycle);
      setNotice(
        `已加载 ${info.manifest.runId}：${info.manifest.eventCount} events，Worker checkpoint 回放就绪。`,
      );
    } catch (error) {
      closeTrace();
      setNotice(
        error instanceof Error ? error.message : "无法加载 Trace bundle。",
      );
    }
  }, [closeTrace]);

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
          <button
            type="button"
            className="run-button"
            onClick={() => void loadRecordedTrace()}
            title="加载 current synthetic bundle，由 Worker 回放 Queue 与 Tile 状态"
          >
            {traceInfo ? "重新载入 Trace" : "载入合成回放"}
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
                ? orderedNodes.length
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
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="topology-list">
            {browserMode === "topology"
              ? visibleNodes.map(({ node, instance }) => {
                  const definition = CORE_BRICK_BY_ID.get(node.definitionId);
                  const connections = topology
                    ? nodeConnections(topology, node.id)
                    : { incoming: [], outgoing: [] };
                  return (
                    <button
                      type="button"
                      key={node.id}
                      className={
                        selectedNodeId === node.id
                          ? "topology-node active"
                          : "topology-node"
                      }
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
                          {definition?.kind === "queue"
                            ? "PIPE"
                            : `R${instance.topologyRank}`}{" "}
                          · {instance.laneId}
                        </small>
                      </span>
                      <span className="edge-count">
                        {connections.incoming.length}↓{" "}
                        {connections.outgoing.length}↑
                      </span>
                    </button>
                  );
                })
              : visibleCandidates.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.candidateId}
                    className={
                      selectedCandidateId === candidate.candidateId
                        ? "topology-node catalog-node active"
                        : "topology-node catalog-node"
                    }
                    onClick={() => {
                      setSelectedCandidateId(candidate.candidateId);
                      setSelectedNodeId(undefined);
                    }}
                  >
                    <span
                      className={`node-mark representation-${candidate.representation}`}
                    />
                    <span>
                      <strong>
                        {candidate.h1}.{candidate.h2}.{candidate.h3}
                      </strong>
                      <small>{candidate.name}</small>
                    </span>
                    <span className="candidate-kind">
                      {candidate.representation}
                    </span>
                  </button>
                ))}
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
                selectedInstanceId={selectedNodeId}
                onSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedCandidateId(undefined);
                  setBrowserMode("topology");
                }}
                onBlank={() => {
                  setSelectedNodeId(undefined);
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
          <div className="scene-state-legend" aria-label="Entry state legend">
            <span>
              <i className="entry-swatch entry-occupied" /> 数据流动
            </span>
            <span>
              <i className="entry-swatch entry-empty" /> 空闲管道
            </span>
            <small>
              {traceInfo ? "TRACE · SYNTHETIC BUNDLE" : "PREVIEW · 非仿真状态"}
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
            <CatalogInspector candidate={selectedCandidate} catalog={catalog} />
          ) : selectedNode && selectedDefinition && world && topology ? (
            <NodeInspector
              node={selectedNode}
              definition={selectedDefinition}
              topology={topology}
              world={world}
              snapshot={traceSnapshot}
              onSelect={(nodeId) => {
                setSelectedNodeId(nodeId);
                setSelectedCandidateId(undefined);
              }}
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
            ? `Current synthetic trace · core cycle ${traceCycle}`
            : "管道光点为数据流预览 · Trace 未载入"}
        </span>
      </footer>
    </main>
  );
}

interface CatalogInspectorProps {
  readonly candidate: DavinciCandidateMapping;
  readonly catalog: DavinciCatalogMapping;
}

function CatalogInspector({ candidate, catalog }: CatalogInspectorProps) {
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
              {candidate.ownerCandidateId ?? candidate.ownerStatus}
            </strong>
          </div>
        </div>
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
  readonly onSelect: (nodeId: string) => void;
}

function NodeInspector({
  node,
  definition,
  topology,
  world,
  snapshot,
  onSelect,
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
  return (
    <div className="inspector-content">
      <div className="identity-block">
        <span>稳定拓扑 ID</span>
        <code>{node.id}</code>
      </div>
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
                  onClick={() => onSelect(item.storageNodeId)}
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
                  onClick={() => onSelect(item.entityId)}
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
              onClick={() => onSelect(edge.from.nodeId)}
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
              onClick={() => onSelect(edge.to.nodeId)}
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
