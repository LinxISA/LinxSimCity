#!/usr/bin/env node
/* global console, process */
import { resolve } from "node:path";

import { generatePerformanceFixture } from "./fixture.mjs";

const output = resolve(process.argv[2] ?? "build/perf/m8-large.bundle");
const fixture = await generatePerformanceFixture(output);
console.log(JSON.stringify(fixture.performance, null, 2));
