#!/usr/bin/env bash
set -euo pipefail

: "${PYCIRCUIT_ROOT:?Set PYCIRCUIT_ROOT to the pyCircuit checkout}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_root="${repository_root}/build/catalog/davincioo-h3"
catalog_path="designs/davincioo/catalog.json"
catalog_snapshot="${artifact_root}/catalog.json"
tree_manifest="${artifact_root}/tree.txt"
output_path="${repository_root}/apps/game/public/catalogs/davincioo-h3.json"
revision="$(git -C "${PYCIRCUIT_ROOT}" rev-parse HEAD)"
repository="$(git -C "${PYCIRCUIT_ROOT}" remote get-url origin)"

mkdir -p "${artifact_root}" "$(dirname "${output_path}")"
git -C "${PYCIRCUIT_ROOT}" show "${revision}:${catalog_path}" >"${catalog_snapshot}"
git -C "${PYCIRCUIT_ROOT}" ls-tree -r --name-only "${revision}" >"${tree_manifest}"

npm run build --workspace @linxsimcity/topology-import
node "${repository_root}/tools/topology-import/dist/main.js" \
  davincioo-catalog "${catalog_snapshot}" \
  --tree "${tree_manifest}" \
  --repository "${repository}" \
  --revision "${revision}" \
  --catalog-path "${catalog_path}" \
  --output "${output_path}"
