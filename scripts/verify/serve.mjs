#!/usr/bin/env node
/**
 * The serving gate.
 *
 * Starts the API on a loopback port, asks it the questions a client asks, and
 * checks the answers. The server is stopped before the gate exits.
 *
 *   node scripts/verify/serve.mjs
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.HAPI_GATE_PORT ?? 8791);
const base = `http://127.0.0.1:${port}`;

// The gate serves the committed sample dataset, so it runs offline and needs
// no crawl first.
const sample = join(root, "test", "fixtures", "dataset");
if (!existsSync(sample)) {
  console.error("GATE FAILED: the committed sample dataset is missing");
  process.exit(1);
}
const dataDirectory = mkdtempSync(join(tmpdir(), "hapi-serve-"));
cpSync(sample, dataDirectory, { recursive: true });

const failures = [];
const fail = (message) => failures.push(message);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${base}/v1/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

const server = spawn(process.execPath, [join(root, "src", "server-node.ts")], {
  cwd: root,
  env: {
    ...process.env,
    HAPI_PORT: String(port),
    HAPI_HOST: "127.0.0.1",
    HAPI_DATA_DIR: dataDirectory,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

async function get(path) {
  const response = await fetch(`${base}${path}`);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body, text };
}

try {
  const up = await waitForServer();
  if (!up) {
    fail(`the server did not start.\n${serverOutput}`);
  } else {
    const index = await get("/v1");
    if (index.response.status !== 200) fail("/v1 did not answer 200");
    if (index.body?.service !== "hapi") fail("/v1 did not return the service index");

    const models = await get("/v1/models?perPage=25");
    if (models.response.status !== 200) fail("/v1/models did not answer 200");
    if (!Array.isArray(models.body?.rows)) fail("/v1/models did not return rows");
    if (models.response.headers.get("access-control-allow-origin") !== "*") {
      fail("/v1/models did not open the CORS headers");
    }

    const recipes = await get("/v1/recipes?sort=kl&perPage=25");
    if (recipes.response.status !== 200) fail("/v1/recipes did not answer 200");
    if (!Array.isArray(recipes.body?.rows)) fail("/v1/recipes did not return rows");

    const stats = await get("/v1/stats");
    if (stats.response.status !== 200) fail("/v1/stats did not answer 200");
    if (stats.body?.rate?.basis !== "derived") fail("/v1/stats did not label the rate as derived");

    const missing = await get("/v1/recipes/rcp_does_not_exist");
    if (missing.response.status !== 404) fail("an unknown recipe did not answer 404");
    if (missing.body?.error?.code !== "not_found") fail("an unknown recipe did not use the error shape");

    const head = await fetch(`${base}/v1/models`, { method: "HEAD" });
    if (head.status !== 200) fail("a HEAD request did not answer 200");
    if ((await head.text()) !== "") fail("a HEAD request returned a body");
  }
} finally {
  server.kill("SIGTERM");
  rmSync(dataDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("GATE FAILED: the served API did not answer correctly");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("SERVE PASSED: the API answered over HTTP with the documented shape");
