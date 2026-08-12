import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { gunzipSync, gzipSync } from "node:zlib";

const [sourceArgument, outputRootArgument] = process.argv.slice(2);
if (!sourceArgument || !outputRootArgument) {
  throw new Error(
    "usage: node make-malformed-fixtures.mjs SOURCE.trace-dir OUTPUT_ROOT",
  );
}

const source = resolve(sourceArgument);
const outputRoot = resolve(outputRootArgument);
const fixtures = [
  {
    name: "missing-entity.trace-dir",
    mutate(events) {
      events[0].entity_id = "core.scalar.missing";
    },
  },
  {
    name: "out-of-order.trace-dir",
    mutate(events) {
      const index = events.findIndex(
        (event, eventIndex) =>
          eventIndex > 0 && event.cycle === 120 && event.seq === 1,
      );
      if (index < 0) throw new Error("cycle 120 seq 1 event not found");
      events[index].seq = 0;
    },
  },
];

for (const fixture of fixtures) {
  const destination = resolve(outputRoot, fixture.name);
  await cp(source, destination, { recursive: true, force: true });
  const chunkPath = resolve(destination, "chunks/000000.jsonl.gz");
  const events = gunzipSync(await readFile(chunkPath))
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map(JSON.parse);
  fixture.mutate(events);
  await writeFile(
    chunkPath,
    gzipSync(`${events.map(JSON.stringify).join("\n")}\n`, { mtime: 0 }),
  );
}
