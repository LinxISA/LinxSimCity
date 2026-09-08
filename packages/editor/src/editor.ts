import type {
  Blueprint,
  BlueprintLink,
  BrickInstance,
  WorldPosition,
} from "@linxsimcity/world";

export type EditorTool = "select" | "place" | "connect";

export interface EditorState {
  readonly past: readonly Blueprint[];
  readonly present: Blueprint;
  readonly future: readonly Blueprint[];
  readonly selectedInstanceId: string | undefined;
  readonly placementDefinitionId: string | undefined;
  readonly linkSourceInstanceId: string | undefined;
  readonly tool: EditorTool;
}

export type EditorAction =
  | { readonly type: "select"; readonly instanceId?: string }
  | { readonly type: "arm-place"; readonly definitionId: string }
  | { readonly type: "arm-connect"; readonly instanceId: string }
  | { readonly type: "cancel-tool" }
  | { readonly type: "place"; readonly instance: BrickInstance }
  | {
      readonly type: "move";
      readonly instanceId: string;
      readonly position: WorldPosition;
    }
  | { readonly type: "rotate"; readonly instanceId: string }
  | { readonly type: "remove"; readonly instanceId: string }
  | { readonly type: "connect"; readonly link: BlueprintLink }
  | {
      readonly type: "set-parameter";
      readonly instanceId: string;
      readonly parameterId: string;
      readonly value: number;
    }
  | { readonly type: "replace"; readonly blueprint: Blueprint }
  | { readonly type: "undo" }
  | { readonly type: "redo" };

export function createEditorState(blueprint: Blueprint): EditorState {
  return {
    past: [],
    present: blueprint,
    future: [],
    selectedInstanceId: undefined,
    placementDefinitionId: undefined,
    linkSourceInstanceId: undefined,
    tool: "select",
  };
}

function commit(state: EditorState, next: Blueprint): EditorState {
  return {
    ...state,
    past: [...state.past, state.present],
    present: { ...next, revision: state.present.revision + 1 },
    future: [],
  };
}

function updateInstance(
  blueprint: Blueprint,
  instanceId: string,
  update: (instance: BrickInstance) => BrickInstance,
): Blueprint {
  return {
    ...blueprint,
    instances: blueprint.instances.map((item) =>
      item.id === instanceId ? update(item) : item,
    ),
  };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "select":
      return {
        ...state,
        selectedInstanceId: action.instanceId,
        tool: "select",
      };
    case "arm-place":
      return {
        ...state,
        placementDefinitionId: action.definitionId,
        tool: "place",
      };
    case "arm-connect":
      return {
        ...state,
        linkSourceInstanceId: action.instanceId,
        tool: "connect",
      };
    case "cancel-tool":
      return {
        ...state,
        placementDefinitionId: undefined,
        linkSourceInstanceId: undefined,
        tool: "select",
      };
    case "place":
      return {
        ...commit(state, {
          ...state.present,
          instances: [...state.present.instances, action.instance],
        }),
        selectedInstanceId: action.instance.id,
        placementDefinitionId: undefined,
        tool: "select",
      };
    case "move":
      return commit(
        state,
        updateInstance(state.present, action.instanceId, (instance) => ({
          ...instance,
          transform: { ...instance.transform, position: action.position },
        })),
      );
    case "rotate":
      return commit(
        state,
        updateInstance(state.present, action.instanceId, (instance) => ({
          ...instance,
          transform: {
            ...instance.transform,
            yawQuarterTurns: ((instance.transform.yawQuarterTurns + 1) % 4) as
              0 | 1 | 2 | 3,
          },
        })),
      );
    case "remove":
      return {
        ...commit(state, {
          ...state.present,
          instances: state.present.instances.filter(
            (item) => item.id !== action.instanceId,
          ),
          links: state.present.links.filter(
            (item) =>
              item.from.instanceId !== action.instanceId &&
              item.to.instanceId !== action.instanceId,
          ),
        }),
        selectedInstanceId:
          state.selectedInstanceId === action.instanceId
            ? undefined
            : state.selectedInstanceId,
      };
    case "connect":
      return {
        ...commit(state, {
          ...state.present,
          links: [...state.present.links, action.link],
        }),
        linkSourceInstanceId: undefined,
        tool: "select",
      };
    case "set-parameter":
      return commit(
        state,
        updateInstance(state.present, action.instanceId, (instance) => ({
          ...instance,
          parameters: {
            ...instance.parameters,
            [action.parameterId]: action.value,
          },
        })),
      );
    case "replace":
      return createEditorState(action.blueprint);
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        selectedInstanceId: undefined,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        selectedInstanceId: undefined,
      };
    }
  }
}
