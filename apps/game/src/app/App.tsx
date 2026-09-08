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
  const importInput = useRef<HTMLInputElement>(null);
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

  const loadDefault = useCallback(async () => {
    try {
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
  }, []);

  useEffect(() => {
    void loadDefault();
  }, [loadDefault]);

  const importTopology = async (file: File) => {
    try {
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
            disabled
            title="真实 trace 接入后可沿拓扑播放 SimQueue 与 Tile 数据流"
          >
            Trace 未连接
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
                          R{instance.topologyRank} · {instance.laneId}
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
                  <span>拓扑层</span>
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
            拓扑排序 · Scope 泳道 · 正交连线
          </div>
          <div className="axis-readout" aria-label="World axes">
            <span className="axis-x">X</span>
            <span className="axis-y">Y</span>
            <span className="axis-z">Z</span>
          </div>
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
          <i className="status-dot" /> 拓扑只读 · Trace 尚未接入
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
  readonly onSelect: (nodeId: string) => void;
}

function NodeInspector({
  node,
  definition,
  topology,
  world,
  onSelect,
}: NodeInspectorProps) {
  const instance = world.instances.find((item) => item.id === node.id)!;
  const position = positionToTuple(instance.transform.position);
  const connections = nodeConnections(topology, node.id);
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
          {Object.entries(node.attributes ?? {}).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
      </section>

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
