#!/usr/bin/env node
/**
 * The self-hosted refresh, run by cron on the server that serves the API.
 *
 * The Node entry reads `data/current`, a symlink switched only after the whole
 * dataset has been built and validated. An expired token or an empty discovery
 * stops the run before the previous good files are touched, and an unchanged
 * source skips the rebuild entirely.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { needsBuild, sourceSignature } from "./lib/refresh-state.ts";

const root = resolve(process.cwd());
const data = join(root, "data");
const staging = join(data, "staging");
const current = join(data, "current");
const signaturePath = join(data, "last-signature");
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

function readSignature() {
  try {
    return readFileSync(signaturePath, "utf8").trim();
  } catch {
    return null;
  }
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

const rawText = readFileSync(join(data, "raw.json"), "utf8");
const signature = sourceSignature(root, rawText);
if (!needsBuild(readSignature(), signature) && existsSync(join(current, "meta.json"))) {
  const meta = JSON.parse(readFileSync(join(current, "meta.json"), "utf8"));
  console.log(`Nothing changed. Keeping ${meta.version} and skipping the rebuild.`);
  await verifyLive(meta.version);
  process.exit(0);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
// The coverage guard needs the last published baseline, not an empty stage.
if (existsSync(join(current, "meta.json"))) {
  copyFileSync(join(current, "meta.json"), join(staging, "meta.json"));
}

const buildEnv = { HAPI_DIST_DIR: staging };
run("build", "npm", ["run", "build:dataset"], buildEnv);
run("stats", "npm", ["run", "build:stats"], buildEnv);
run("dataset gate", "node", ["scripts/verify/gate.mjs", "dataset"], {
  HAPI_DATASET_DIR: staging,
});
run("publish", "node", ["scripts/publish-local.mjs", "data/staging"]);

const published = JSON.parse(readFileSync(join(current, "meta.json"), "utf8"));
await verifyLive(published.version);
writeFileSync(signaturePath, `${signature}\n`);
