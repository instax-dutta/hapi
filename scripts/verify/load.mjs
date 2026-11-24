#!/usr/bin/env node
/**
 * A bounded, read-only load check for the public API.
 *
 * It asks the endpoints a homepage actually uses, at a modest concurrency,
 * and reports the latency distribution instead of a single average. No write,
 * no `/v1/parse` and no unbounded loop: the check is safe to point at the
 * published host.
 */
const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const total = Number(process.argv[3] ?? 240);
const concurrency = Number(process.argv[4] ?? 12);

const paths = [
  "/v1",
  "/v1/health",
  "/v1/meta",
  "/v1/summary",
  "/v1/models?perPage=25&sort=score",
  "/v1/recipes?perPage=25&sort=score",
  "/v1/repos?perPage=25&sort=recent",
  "/v1/creators?perPage=25",
  "/v1/stats",
  "/v1/families",
  "/v1/formats",
  "/v1/openapi.json",
  "/v1/recipes/does-not-exist",
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

let next = 0;
const latencies = [];
const failures = [];
const statuses = new Map();
let missingCors = 0;
let bytes = 0;

async function worker() {
  while (next < total) {
    const path = paths[next % paths.length];
    next += 1;
    const started = performance.now();
    try {
      const response = await fetch(base + path);
      const body = await response.arrayBuffer();
      const ms = performance.now() - started;
      latencies.push(ms);
      bytes += body.byteLength;
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (response.headers.get("access-control-allow-origin") !== "*") missingCors += 1;
      if (response.status >= 500 && failures.length < 5) {
        failures.push(`${path} returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (failures.length < 5) failures.push(`${path}: ${error.message}`);
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsed = (performance.now() - started) / 1000;
const sorted = [...latencies].sort((a, b) => a - b);
const fiveXx = [...statuses.entries()].filter(([status]) => status >= 500).reduce((sum, [, n]) => sum + n, 0);

const report = {
  base,
  requests: total,
  concurrency,
  elapsedSeconds: Math.round(elapsed * 100) / 100,
  requestsPerSecond: Math.round(total / elapsed),
  transferredMB: Math.round((bytes / 1024 / 1024) * 100) / 100,
  p50Ms: Math.round(percentile(sorted, 50)),
  p95Ms: Math.round(percentile(sorted, 95)),
  p99Ms: Math.round(percentile(sorted, 99)),
  maxMs: Math.round(sorted.at(-1) ?? 0),
  statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0])),
  missingCors,
  failures,
};
console.log(JSON.stringify(report, null, 2));

if (failures.length > 0 || fiveXx > 0 || missingCors > 0) {
  console.error("LOAD CHECK FAILED");
  process.exit(1);
}
if (report.p95Ms > 1500 || report.p99Ms > 3000) {
  console.error("LOAD CHECK FAILED: the latency bound was exceeded");
  process.exit(1);
}
console.log("LOAD CHECK PASSED");
