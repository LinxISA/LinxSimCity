# PipeView Stage City Preview Report

## Result

The default FA trace now renders a topology-driven rectangular core city. The
macro floorplan preserves the established Scalar, Vector, BG/CELL, CUBE, TLSU,
and Shared Tile Register districts while replacing coarse internal blocks with
SuperScalarModel PipeView stage buildings joined by physical straight pipes.

## Physical layout

- Core footprint: `240 × 128`, aspect ratio `1.875`.
- Six non-overlapping macro districts.
- Shared Tile Register is directly below CUBE and contains `2,048 × 128B`
  individually addressable cells (`256KB`).
- CUBE keeps four PE strips, 16 horizontal A lanes, four vertical B broadcasts,
  and 256 visible MAC cells above the Calc stage roof.

## Stage city

- 94 stage buildings.
- 87 stage-to-stage pipes.
- Scalar front-end/back-end stages, including ROB/PRF/cache detail.
- Independent scalar memory-wait buildings: `L1M`, `L2M`, `MR`, `L2R`, `L1R`,
  and `LR`.
- Vector, CUBE, accumulator conversion, TLSU, and Tile Bridge stage sequences.
- Four PE bays per stage use thread-specific colors and trace-driven activity.

## Default trace

- `199,585` events across three chunks.
- Directory and `.linxtrace` archive both validate successfully.
- Pages manifest SHA-256:
  `f84ae484d8004a86156da6ee8f7697a917f1a15fc7876ac15eb4435f78ab3dbe`.
- Pages topology SHA-256:
  `71eaab6780714ef47bee5262af493bafa7325b068545517b48cfa20b658a5636`.

## Visual verification

The local production build was inspected in the in-app browser at the Core
camera preset. The complete rectangular footprint is in frame; macro districts
do not overlap; CUBE and Shared Tile Register are vertically separated; stage
labels and the live commit HUD are present. The browser page exposes 83,968
128-byte CELLs, 256 MACs, and 2,048 Shared Tile cells.

## Remaining trace-depth work

The renderer is ready for per-stage activity, but stages without corresponding
events in the current FA trace remain inactive. Future SuperScalarModel trace
emission should add the complete stage transitions and physical routing metadata
for every instruction, cache access, CELL request, and TLSU queue transition.
