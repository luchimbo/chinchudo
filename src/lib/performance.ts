import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

/** Logs contain identifiers and elapsed time only, never prompts, tokens or errors. */
export function operationTiming(operation: string, operationId: string = randomUUID()) {
  return {
    id: operationId,
    async measure<T>(stage: string, work: () => Promise<T>): Promise<T> {
      const start = performance.now();
      let ok = false;
      try { const value = await work(); ok = true; return value; }
      finally { console.info(JSON.stringify({ event: "performance", operation, operationId, stage, durationMs: Math.round(performance.now() - start), ok })); }
    },
  };
}
