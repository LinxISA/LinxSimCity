import type { SerializedViewerSnapshot } from "@linxsimcity/trace-runtime";

import { Building } from "../common/Building.js";
import { DistrictFrame } from "../common/DistrictFrame.js";
import { StraightPipe } from "../common/StraightPipe.js";
import { CacheCells } from "./CacheCells.js";
import { ExecutionPipes } from "./ExecutionPipes.js";
import { RobRing } from "./RobRing.js";

interface ScalarCpuProps {
  readonly snapshot?: SerializedViewerSnapshot | undefined;
  readonly selectedEntityId?: string | undefined;
  readonly onSelect?: ((entityId: string) => void) | undefined;
}

export function ScalarCpu({
  snapshot,
  selectedEntityId,
  onSelect,
}: ScalarCpuProps) {
  return (
    <group>
      <DistrictFrame
        label="SCALAR · GEM5-STYLE O3"
        x={-72}
        z={-30}
        width={14}
        depth={54}
        color="#a979ff"
      />
      <Building
        id="core.scalar.l1i"
        label="L1I · 1024 lines"
        position={[-65.1, 0.38, -26.7]}
        size={[11.3, 0.65, 5.5]}
        color="#2b1b49"
        onSelect={onSelect}
      />
      <CacheCells
        cache="l1i"
        origin={[-70.05, -28.7]}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.bpu"
        label="BPU · BTB"
        position={[-68.7, 1.25, -21.5]}
        size={[5.2, 2.4, 2.8]}
        color="#472b72"
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.fetch"
        label="Fetch F0–F3"
        position={[-62.2, 1.4, -21.5]}
        size={[5.9, 2.7, 2.8]}
        color="#563288"
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.decode"
        label="Decode"
        position={[-65.1, 1.25, -16.7]}
        size={[11.2, 2.4, 3.2]}
        color="#4a2b79"
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.rename"
        label="Rename · PRF"
        position={[-65.1, 1.65, -11.3]}
        size={[11.2, 3.2, 3.6]}
        color="#56318a"
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.iq"
        label="IEX IQ · Scoreboard"
        position={[-65.1, 1.35, -5.4]}
        size={[11.2, 2.6, 3.6]}
        color="#472979"
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.execute"
        label="INT · FP · LD · ST"
        position={[-65.9, 0.95, 2.1]}
        size={[10.3, 1.75, 5.2]}
        color="#39245f"
        onSelect={onSelect}
      />
      <ExecutionPipes />
      <Building
        id="core.scalar.lsu"
        label="LQ · SQ · LSU"
        position={[-65.1, 1.1, 10.8]}
        size={[11.1, 2.05, 3.0]}
        color="#493078"
        onSelect={onSelect}
      />
      <RobRing
        center={[-65.1, 14.7]}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.commit"
        label="Commit"
        position={[-65.1, 1.1, 14.7]}
        size={[4.2, 2.0, 2.2]}
        color="#563389"
        onSelect={onSelect}
      />
      <Building
        id="core.scalar.l1d"
        label="L1D · 1024 lines"
        position={[-65.1, 0.35, 21.1]}
        size={[11.3, 0.58, 4.9]}
        color="#321c55"
        onSelect={onSelect}
      />
      <CacheCells
        cache="l1d"
        origin={[-70.05, 19.0]}
        snapshot={snapshot}
        selectedEntityId={selectedEntityId}
        onSelect={onSelect}
      />
      <StraightPipe
        from={[-65.1, 1.1, -20]}
        to={[-65.1, 1.1, -18.4]}
        color="#a979ff"
      />
      <StraightPipe
        from={[-65.1, 1.1, -15]}
        to={[-65.1, 1.1, -13.2]}
        color="#a979ff"
      />
      <StraightPipe
        from={[-65.1, 1.1, -9.4]}
        to={[-65.1, 1.1, -7.3]}
        color="#a979ff"
      />
    </group>
  );
}
