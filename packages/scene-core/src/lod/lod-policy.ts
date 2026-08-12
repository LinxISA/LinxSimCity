export type SceneLod = "district" | "bank" | "cell";

export function resolveLod(
  distance: number,
  current: SceneLod,
  forceCell = false,
): SceneLod {
  if (forceCell) return "cell";
  if (current === "district") {
    if (distance >= 112.5) return "district";
    return distance < 54 ? "cell" : "bank";
  }
  if (current === "cell") {
    if (distance > 137.5) return "district";
    return distance > 66 ? "bank" : "cell";
  }
  if (distance > 137.5) return "district";
  if (distance < 54) return "cell";
  return "bank";
}
