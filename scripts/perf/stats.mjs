export const PERFORMANCE_THRESHOLDS = Object.freeze({
  frameP95Ms: 25,
  seekP95Ms: 500,
});

/** @param {readonly number[]} samples @param {number} percentile */
export function percentile(samples, percentile) {
  if (samples.length === 0) throw new RangeError("percentile requires samples");
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new RangeError("percentile must be between 0 and 1");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = (sorted.length - 1) * percentile;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = /** @type {number} */ (sorted[lower]);
  const upperValue = /** @type {number} */ (sorted[upper]);
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

/** @param {readonly number[]} samples */
export function summarizeSamples(samples) {
  return {
    count: samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
  };
}

/** @param {{ frame: { p95Ms: number }, seek: { p95Ms: number } }} metrics */
export function evaluatePerformanceThresholds(metrics) {
  const checks = [
    {
      id: "frame-p95",
      actualMs: metrics.frame.p95Ms,
      maximumMs: PERFORMANCE_THRESHOLDS.frameP95Ms,
      pass: metrics.frame.p95Ms <= PERFORMANCE_THRESHOLDS.frameP95Ms,
    },
    {
      id: "seek-p95",
      actualMs: metrics.seek.p95Ms,
      maximumMs: PERFORMANCE_THRESHOLDS.seekP95Ms,
      pass: metrics.seek.p95Ms <= PERFORMANCE_THRESHOLDS.seekP95Ms,
    },
  ];
  return { pass: checks.every((check) => check.pass), checks };
}
