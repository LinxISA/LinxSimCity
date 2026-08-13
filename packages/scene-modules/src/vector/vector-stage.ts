export type VectorModuleKey = "vrf" | "fmla" | "alu" | "reduce";

export function vectorModuleForStage(
  stage: string | undefined,
): VectorModuleKey | undefined {
  if (stage === "fma" || stage === "fmla") return "fmla";
  if (stage === "alu") return "alu";
  if (stage === "reduce") return "reduce";
  if (stage === "writeback") return "vrf";
  return undefined;
}
