import {
  CORE_BRICKS,
  CORE_BRICK_BY_ID,
  CORE_CATALOG,
} from "@linxsimcity/component-catalog";
import type { BrickDefinition } from "@linxsimcity/component-catalog";
import { createEditorState, editorReducer } from "@linxsimcity/editor";
import {
  blueprintFingerprint,
  createInstance,
  emptyBlueprint,
  positionToTuple,
  validateBlueprint,
} from "@linxsimcity/world";
import type { Blueprint, BrickInstance } from "@linxsimcity/world";
import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useReducer,
  useRef,
  useState,
  Suspense,
} from "react";

import { proposeLink } from "./links.js";
import {
  BLUEPRINT_STORAGE_KEY,
  loadSavedBlueprint,
  parseBlueprint,
} from "./persistence.js";
import { createStarterBlueprint } from "./starter.js";
import "./styles.css";

const WorldScene = lazy(async () => {
  const module = await import("@linxsimcity/brick-kit");
  return { default: module.WorldScene };
});

function createId(prefix: string): string {
  return `${prefix}.${crypto.randomUUID()}`;
}

function loadInitialBlueprint(): Blueprint {
  try {
    return loadSavedBlueprint(localStorage) ?? createStarterBlueprint();
  } catch {
    return createStarterBlueprint();
  }
}

function downloadBlueprint(blueprint: Blueprint): void {
  const blob = new Blob([`${JSON.stringify(blueprint, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${blueprint.id}.linxblueprint.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function compatibleOutputCount(definition: BrickDefinition): number {
  return definition.ports.filter((port) => port.direction !== "input").length;
}

export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState(loadInitialBlueprint()),
  );
  const [notice, setNotice] = useState(
    "蓝图已就绪。选择一种积木，然后点击工作台放置。",
  );
  const importInput = useRef<HTMLInputElement>(null);
  const selected = state.present.instances.find(
    (item) => item.id === state.selectedInstanceId,
  );
  const selectedDefinition = selected
    ? CORE_BRICK_BY_ID.get(selected.definitionId)
    : undefined;
  const diagnostics = useMemo(
    () => validateBlueprint(state.present, CORE_CATALOG),
    [state.present],
  );
  const fingerprint = useMemo(
    () => blueprintFingerprint(state.present),
    [state.present],
  );

  useEffect(() => {
    localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(state.present));
  }, [state.present]);

  const selectInstance = useCallback(
    (instanceId: string) => {
      if (state.tool === "connect" && state.linkSourceInstanceId) {
        const proposal = proposeLink(
          state.present,
          CORE_BRICK_BY_ID,
          state.linkSourceInstanceId,
          instanceId,
          createId("link"),
        );
        if (proposal.ok) {
          dispatch({ type: "connect", link: proposal.link });
          setNotice("连接已建立。端口类型和位宽已校验。");
        } else {
          setNotice(proposal.message);
        }
        return;
      }
      dispatch({ type: "select", instanceId });
    },
    [state.linkSourceInstanceId, state.present, state.tool],
  );

  const placeOnGround = useCallback(
    (position: readonly [number, number, number]) => {
      if (state.tool !== "place" || !state.placementDefinitionId) return;
      const definition = CORE_BRICK_BY_ID.get(state.placementDefinitionId);
      if (!definition) return;
      const instance = createInstance(
        createId(definition.kind),
        definition,
        position,
      );
      dispatch({ type: "place", instance });
      setNotice(`${definition.label} 已放置在 (${position.join(", ")})。`);
    },
    [state.placementDefinitionId, state.tool],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (event.key.toLowerCase() === "r" && state.selectedInstanceId) {
        dispatch({ type: "rotate", instanceId: state.selectedInstanceId });
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        state.selectedInstanceId
      ) {
        dispatch({ type: "remove", instanceId: state.selectedInstanceId });
      } else if (event.key === "Escape") {
        dispatch({ type: "cancel-tool" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.selectedInstanceId]);

  const importBlueprint = async (file: File) => {
    try {
      const blueprint = parseBlueprint(await file.text());
      dispatch({ type: "replace", blueprint });
      setNotice(`已导入 ${blueprint.name}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取蓝图。");
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
            <span>芯片城市实验台</span>
          </div>
        </div>
        <div className="run-identity" aria-label="Current blueprint identity">
          <span>{state.present.name}</span>
          <code>{fingerprint.slice(-8)}</code>
          <span className={diagnostics.length === 0 ? "valid" : "invalid"}>
            {diagnostics.length === 0
              ? "结构有效"
              : `${diagnostics.length} 个问题`}
          </span>
        </div>
        <div className="command-actions">
          <button
            type="button"
            onClick={() => dispatch({ type: "undo" })}
            disabled={state.past.length === 0}
          >
            撤销
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "redo" })}
            disabled={state.future.length === 0}
          >
            重做
          </button>
          <button
            type="button"
            onClick={() => downloadBlueprint(state.present)}
          >
            导出
          </button>
          <button type="button" onClick={() => importInput.current?.click()}>
            导入
          </button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="导入蓝图"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBlueprint(file);
            }}
          />
          <button
            type="button"
            className="run-button"
            disabled
            title="真实仿真 runner 将在 trace 里程碑接入"
          >
            仿真未连接
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="palette-panel" aria-label="标准积木库">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BRICK LIBRARY</span>
              <h1>标准积木</h1>
            </div>
            <span className="count">{CORE_BRICKS.length}</span>
          </div>
          <div className="brick-list">
            {CORE_BRICKS.map((definition) => (
              <button
                type="button"
                key={definition.id}
                className={
                  state.placementDefinitionId === definition.id
                    ? "brick-choice active"
                    : "brick-choice"
                }
                onClick={() => {
                  dispatch({ type: "arm-place", definitionId: definition.id });
                  setNotice(`点击工作台放置 ${definition.label}。`);
                }}
              >
                <span
                  className={`brick-swatch kind-${definition.kind}`}
                  aria-hidden="true"
                />
                <span>
                  <strong>{definition.label}</strong>
                  <small>{definition.description}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="palette-footer">
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "replace", blueprint: emptyBlueprint() });
                setNotice("已创建空白芯片工作区。");
              }}
            >
              空白工作区
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({
                  type: "replace",
                  blueprint: createStarterBlueprint(),
                });
                setNotice("已恢复 Tile data path 示例。");
              }}
            >
              恢复示例
            </button>
          </div>
        </aside>

        <section className="scene-panel" aria-label="3D 芯片建造工作台">
          <Suspense
            fallback={<div className="scene-loading">正在准备 3D 工作台…</div>}
          >
            <WorldScene
              className="scene-canvas"
              blueprint={state.present}
              definitions={CORE_BRICK_BY_ID}
              selectedInstanceId={state.selectedInstanceId}
              linkSourceInstanceId={state.linkSourceInstanceId}
              onSelect={selectInstance}
              onGround={placeOnGround}
              onBlank={() => {
                if (state.tool === "select") dispatch({ type: "select" });
              }}
            />
          </Suspense>
          <div className="scene-mode" aria-live="polite">
            <span className={`mode-light mode-${state.tool}`} />
            {state.tool === "place"
              ? `放置 ${CORE_BRICK_BY_ID.get(state.placementDefinitionId ?? "")?.label ?? "积木"}`
              : state.tool === "connect"
                ? "选择连接目标"
                : "选择模式"}
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

        <aside className="inspector-panel" aria-label="组件检查器">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">INSPECTOR</span>
              <h2>{selectedDefinition?.label ?? "未选择组件"}</h2>
            </div>
          </div>
          {selected && selectedDefinition ? (
            <Inspector
              instance={selected}
              definition={selectedDefinition}
              onRotate={() =>
                dispatch({ type: "rotate", instanceId: selected.id })
              }
              onConnect={() => {
                if (compatibleOutputCount(selectedDefinition) === 0) {
                  setNotice("这个积木没有可作为连接起点的输出端口。");
                  return;
                }
                dispatch({ type: "arm-connect", instanceId: selected.id });
                setNotice(
                  `从 ${selectedDefinition.label} 出发：请选择目标积木。`,
                );
              }}
              onRemove={() =>
                dispatch({ type: "remove", instanceId: selected.id })
              }
              onParameter={(parameterId, value) =>
                dispatch({
                  type: "set-parameter",
                  instanceId: selected.id,
                  parameterId,
                  value,
                })
              }
            />
          ) : (
            <div className="empty-inspector">
              <div className="selection-reticle" aria-hidden="true" />
              <p>选择工作台上的积木，检查端口、参数和空间位置。</p>
            </div>
          )}
          <div className="world-summary">
            <div>
              <span>组件</span>
              <strong>{state.present.instances.length}</strong>
            </div>
            <div>
              <span>连接</span>
              <strong>{state.present.links.length}</strong>
            </div>
            <div>
              <span>修订</span>
              <strong>{state.present.revision}</strong>
            </div>
          </div>
          {diagnostics.length > 0 ? (
            <div className="diagnostics" role="alert">
              <strong>结构校验</strong>
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
        <span>
          拖拽旋转 · 滚轮缩放 · R 旋转 · Delete 删除 · ⌘/Ctrl+Z 撤销 · Esc 取消
        </span>
        <span>
          <i className="status-dot" /> 本地自动保存 · Trace 尚未接入
        </span>
      </footer>
    </main>
  );
}

interface InspectorProps {
  readonly instance: BrickInstance;
  readonly definition: BrickDefinition;
  readonly onRotate: () => void;
  readonly onConnect: () => void;
  readonly onRemove: () => void;
  readonly onParameter: (parameterId: string, value: number) => void;
}

function Inspector({
  instance,
  definition,
  onRotate,
  onConnect,
  onRemove,
  onParameter,
}: InspectorProps) {
  const position = positionToTuple(instance.transform.position);
  return (
    <div className="inspector-content">
      <div className="identity-block">
        <span>稳定 ID</span>
        <code>{instance.id}</code>
      </div>
      <div className="position-grid">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <div key={axis}>
            <span>{axis}</span>
            <strong>{position[index]}</strong>
          </div>
        ))}
        <div>
          <span>旋转</span>
          <strong>{instance.transform.yawQuarterTurns * 90}°</strong>
        </div>
      </div>
      <section>
        <h3>参数</h3>
        {Object.entries(definition.parameters).length === 0 ? (
          <p className="muted">这个积木没有可调参数。</p>
        ) : (
          Object.entries(definition.parameters).map(
            ([parameterId, parameter]) => (
              <label className="parameter-row" key={parameterId}>
                <span>{parameter.label}</span>
                <input
                  type="number"
                  min={parameter.minimum}
                  max={parameter.maximum}
                  step={parameter.step}
                  value={instance.parameters[parameterId] ?? parameter.default}
                  onChange={(event) =>
                    onParameter(parameterId, Number(event.target.value))
                  }
                />
              </label>
            ),
          )
        )}
      </section>
      <section>
        <h3>端口</h3>
        <div className="port-list">
          {definition.ports.map((port) => (
            <div key={port.id}>
              <span className={`port-dot port-${port.direction}`} />
              <span>
                <strong>{port.label}</strong>
                <small>
                  {port.protocol} · {port.widthBits} bit
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="inspector-actions">
        <button type="button" onClick={onRotate}>
          旋转 90°
        </button>
        <button type="button" onClick={onConnect}>
          连接
        </button>
        <button type="button" className="danger" onClick={onRemove}>
          删除
        </button>
      </div>
    </div>
  );
}
