#!/usr/bin/env node
/**
 * Run every acceptance gate in one go.
 *
 * Each gate is a separate process so one failure does not hide the others.
 * The success marker is printed only when every gate passed.
 */
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());

const gates = [
  { name: "openapi", script: "openapi.mjs", expect: "OPENAPI VERIFIED" },
  { name: "dataset", script: "dataset.mjs", expect: "DATASET VERIFIED" },
  { name: "dox", script: "dox.mjs", expect: "DOX VERIFIED" },
];

const failed = [];

for (const gate of gates) {
  const script = join(root, "scripts", "verify", gate.script);
  const result = spawnSync(process.execPath, [script], { stdio: "inherit", cwd: root });
  if (result.status !== 0) {
    failed.push(gate.name);
  }
}

if (failed.length > 0) {
  console.error(`GATES FAILED: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`ALL GATES PASSED: ${gates.length} gates`);
