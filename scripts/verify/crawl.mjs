#!/usr/bin/env node
/**
 * The live crawl gate.
 *
 * Runs a small real crawl of the Hugging Face Hub and proves that it produces
 * a dataset with parsed model cards. It is bounded so it stays a gate and not
 * a pipeline run.
 *
 *   node scripts/verify/crawl.mjs
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const out = join(root, "data", "gate-raw.json");

process.stdout.write("\n--- live crawl (25 repositories) ---\n");
const result = spawnSync(
  process.execPath,
  [join(root, "scripts", "crawl.ts"), "--limit", "25", "--concurrency", "4", "--out", out],
  { stdio: "inherit", cwd: root },
);

if (result.status !== 0) {
  console.error("GATE FAILED: the crawl exited nonzero");
  process.exit(result.status ?? 1);
}

if (!existsSync(out)) {
  console.error("GATE FAILED: the crawl wrote no dataset");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(out, "utf8"));
rmSync(out, { force: true });

const repos = Array.isArray(raw.repos) ? raw.repos : [];
const cards = raw.cards ?? {};
const withCard = repos.filter((repo) => cards[repo.id]);

if (repos.length === 0) {
  console.error("GATE FAILED: the crawl found no repositories");
  process.exit(1);
}
if (withCard.length === 0) {
  console.error("GATE FAILED: the crawl parsed no model cards");
  process.exit(1);
}
if (!raw.crawledAt || !Number.isFinite(Date.parse(raw.crawledAt))) {
  console.error("GATE FAILED: the crawl wrote no usable timestamp");
  process.exit(1);
}

console.log(
  `CRAWL PASSED: ${repos.length} repositories discovered, ${withCard.length} cards parsed`,
);
