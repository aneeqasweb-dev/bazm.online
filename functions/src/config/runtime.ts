import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Cost and abuse guardrails shared by every second-generation function.
 * Individual functions may choose a lower ceiling or a longer timeout when the
 * workload requires it, but production deployments must never be unbounded.
 */
setGlobalOptions({
  concurrency: 40,
  cpu: 1,
  maxInstances: 20,
  memory: "512MiB",
  minInstances: 0,
  preserveExternalChanges: false,
  region: "asia-south1",
  timeoutSeconds: 60,
});
