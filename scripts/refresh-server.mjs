#!/usr/bin/env node
/**
 * The self-hosted refresh, run by cron on the server that serves the API.
 *
 * The Node entry reads `dist/` directly, so publishing is a local rebuild
 * followed by a check that the live process picked it up. Every step is loud:
 * an expired Hub token or an empty discovery stops the run before the previous
 * good files are touched.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const live = process.env.HAPI_LIVE_URL ?? "https://hapi.thevinod.lol";

function fail(message) {
  console.error(`REFRESH FAILED: ${message}`);
  process.exit(1);
}

function run(label, command, args, env = {}) {
  console.log(`--- ${label} ---`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) fail(`${label} (exit ${result.status ?? 1})`);
}

async function preflight() {
  const token = process.env.HF_TOKEN;
  if (!token) fail("HF_TOKEN is not set.");
  let response;
  try {
    response = await fetch("https://huggingface.co/api/models?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    fail(`Hugging Face preflight failed: ${error.message}`);
  }
  if (response.status === 401 || response.status === 403) {
    fail(`Hugging Face rejected HF_TOKEN (HTTP ${response.status}). Rotate the token.`);
  }
  if (!response.ok) fail(`Hugging Face preflight returned HTTP ${response.status}.`);
  console.log("HF_TOKEN accepted by the Hub.");
}

async function verifyLive(version) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(`${live}/v1/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      console.log(`attempt ${attempt}: live ${body.dataset.version}, built ${version}`);
      if (body.dataset.version === version) {
        console.log("REFRESH PASSED: the live API is serving the new dataset.");
        return;
      }
    } catch (error) {
      console.log(`attempt ${attempt}: ${error.message}`);
    }
    if (attempt < 6) await new Promise((resolveAfter) => setTimeout(resolveAfter, 60_000));
  }
  fail("the live API is not serving the published dataset version.");
}

await preflight();
run("crawl", "npm", ["run", "crawl", "--", "--concurrency", "8"]);
run("build", "npm", ["run", "build:dataset"]);
run("stats", "npm", ["run", "build:stats"]);
run("dataset gate", "node", ["scripts/verify/gate.mjs", "dataset"], {
  HAPI_DATASET_DIR: "dist",
});

const meta = JSON.parse(readFileSync(join(root, "dist", "meta.json"), "utf8"));
await verifyLive(meta.version);
