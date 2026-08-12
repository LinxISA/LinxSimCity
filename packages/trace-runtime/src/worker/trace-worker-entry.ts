import { expose } from "comlink";

import { TraceWorkerService } from "./trace-worker.js";

expose(new TraceWorkerService());
