import { StraightPipe } from "../common/StraightPipe.js";

export function ExecutionPipes() {
  const xs = [-69.7, -67.2, -64.7, -62.2];
  return (
    <group>
      {xs.map((x, index) => (
        <StraightPipe
          key={x}
          from={[x, 1.35, 3.4]}
          to={[x, 1.35, 10.2]}
          color={["#b96cff", "#8b7cff", "#55b8ff", "#ffb14e"][index]!}
          radius={0.09}
        />
      ))}
    </group>
  );
}
