#!/usr/bin/env node
/**
 * Run a TypeScript entry point with Node's type stripping.
 *
 *   node scripts/verify/run.mjs scripts/crawl.ts
 *
 * Node strips the types itself. This wrapper only exists so the pipeline
 * scripts have one documented way to run, and so a missing Node version fails
 * with a clear message instead of a parse error.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/verify/run.mjs <script.ts>");
  process.exit(2);
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `Node ${process.versions.node} cannot run TypeScript directly. Node 22.18 or newer is required.`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [resolve(process.cwd(), target), ...process.argv.slice(3)], {
  stdio: "inherit",
  cwd: process.cwd(),
});

process.exit(result.status ?? 1);
