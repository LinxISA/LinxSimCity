import type { BrickDefinition } from "@linxsimcity/component-catalog";
import type { Blueprint, BlueprintLink } from "@linxsimcity/world";

export type LinkProposal =
  | { readonly ok: true; readonly link: BlueprintLink }
  | { readonly ok: false; readonly message: string };

export function proposeLink(
  blueprint: Blueprint,
  definitions: ReadonlyMap<string, BrickDefinition>,
  sourceInstanceId: string,
  targetInstanceId: string,
  linkId: string,
): LinkProposal {
  if (sourceInstanceId === targetInstanceId) {
    return { ok: false, message: "请选择另一个积木作为连接目标。" };
  }
  const source = blueprint.instances.find(
    (item) => item.id === sourceInstanceId,
  );
  const target = blueprint.instances.find(
    (item) => item.id === targetInstanceId,
  );
  if (!source || !target) return { ok: false, message: "连接端点已经不存在。" };
  const sourceDefinition = definitions.get(source.definitionId);
  const targetDefinition = definitions.get(target.definitionId);
  if (!sourceDefinition || !targetDefinition) {
    return { ok: false, message: "连接端点缺少组件定义。" };
  }
  const occupied = new Set(
    blueprint.links.map((item) => `${item.to.instanceId}.${item.to.portId}`),
  );
  for (const output of sourceDefinition.ports) {
    if (output.direction === "input") continue;
    for (const input of targetDefinition.ports) {
      if (input.direction === "output") continue;
      if (
        output.protocol !== input.protocol ||
        output.widthBits !== input.widthBits
      )
        continue;
      if (occupied.has(`${target.id}.${input.id}`)) continue;
      return {
        ok: true,
        link: {
          id: linkId,
          from: { instanceId: source.id, portId: output.id },
          to: { instanceId: target.id, portId: input.id },
        },
      };
    }
  }
  return {
    ok: false,
    message: "两个积木没有空闲且类型、位宽一致的输出/输入端口。",
  };
}
