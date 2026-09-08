#!/usr/bin/env bash
set -euo pipefail

: "${PYCIRCUIT_ROOT:?Set PYCIRCUIT_ROOT to the pyCircuit checkout}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_model="${PYCIRCUIT_ROOT}/examples/agentic-circuit/pipelines/davincioo_queue_model.py"
artifact_root="${repository_root}/build/topology/davincioo-queue-model"
plan_path="${artifact_root}/davincioo.queue-plan.json"
output_path="${repository_root}/apps/game/public/topologies/davincioo-queue-model.json"

revision="$(git -C "${PYCIRCUIT_ROOT}" rev-parse HEAD)"
repository="$(git -C "${PYCIRCUIT_ROOT}" remote get-url origin)"
if ! git -C "${PYCIRCUIT_ROOT}" diff --quiet -- \
  examples/agentic-circuit/pipelines/davincioo_queue_model.py \
  compiler/acir; then
  printf '%s\n' \
    "Refusing to replace the default topology: pyCircuit model/compiler inputs are dirty." \
    >&2
  exit 1
fi

mkdir -p "${artifact_root}" "$(dirname "${output_path}")"

PYTHONPATH="${PYCIRCUIT_ROOT}/python/agentic-circuit/src" \
  "${PYCIRCUIT_ROOT}/compiler/acir/tools/ac-queue-cxxgen.py" \
  "${source_model}" \
  --system davincioo_queue_model \
  --acir-output "${artifact_root}/davincioo.ac.mlir" \
  --plan-output "${plan_path}" \
  --acir-opt "${PYCIRCUIT_ROOT}/.pycircuit_out/acir/dev-llvm22/bin/acir-opt" \
  --queue-plan-tool "${PYCIRCUIT_ROOT}/.pycircuit_out/acir/dev-llvm22/bin/acir-queue-plan" \
  --queue-cxxgen-tool "${PYCIRCUIT_ROOT}/.pycircuit_out/acir/dev-llvm22/bin/acir-queue-cxxgen" \
  --output "${artifact_root}/davincioo.cpp"

npm run build --workspace @linxsimcity/topology-import

import_command=(
  node "${repository_root}/tools/topology-import/dist/main.js"
  queue-plan "${plan_path}"
  --model "${source_model}"
  --repository "${repository}"
  --revision "${revision}"
  --output "${output_path}"
)
if ! git -C "${PYCIRCUIT_ROOT}" diff --quiet; then
  import_command+=(--worktree-dirty)
fi
"${import_command[@]}"
