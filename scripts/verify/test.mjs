#!/usr/bin/env node
/**
 * Run the test files under a directory with the Node test runner.
 *
 *   node scripts/verify/test.mjs test/unit
 *
 * The files are passed explicitly so the runner does not depend on a default
 * glob or on a file-extension pattern that differs between Node versions.
 */
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/verify/test.mjs <test directory>");
  process.exit(2);
}

const root = resolve(process.cwd());
const directory = resolve(root, target);
const files = [];

function walk(current) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".test.ts")) files.push(path);
  }
}

walk(directory);
files.sort();

if (files.length === 0) {
  console.error(`no test files under ${target}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: root,
});

process.exit(result.status ?? 1);
