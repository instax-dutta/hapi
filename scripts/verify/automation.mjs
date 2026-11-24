#!/usr/bin/env node
/**
 * Prove the repository carries the automation the refresh depends on.
 *
 * The dataset is refreshed by cron on the self-hosted server and watched from
 * GitHub. A missing workflow or a weakened wrapper does not fail any other
 * gate: the API keeps answering from the last published dataset while its
 * numbers quietly go stale. These checks read the configuration and the
 * wrapper itself, so that cannot pass silently.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const root = resolve(process.cwd());
const failures = [];
const fail = (message) => failures.push(message);
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const has = (relative) => existsSync(join(root, relative));
const read = (relative) => readFileSync(join(root, relative), "utf8");

for (const file of [
  ".github/workflows/ci.yml",
  ".github/workflows/monitor.yml",
  ".github/dependabot.yml",
  ".github/AGENTS.md",
  "scripts/refresh-server.mjs",
]) {
  assert(has(file), `${file} is missing`);
}
if (failures.length > 0) {
  console.error("AUTOMATION VERIFICATION FAILED");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

const ciText = read(".github/workflows/ci.yml");
const monitorText = read(".github/workflows/monitor.yml");
const dependabotText = read(".github/dependabot.yml");
const wrapper = read("scripts/refresh-server.mjs");
let ci;
let monitor;
let dependabot;
try {
  ci = parse(ciText);
  monitor = parse(monitorText);
  dependabot = parse(dependabotText);
} catch (error) {
  fail(`automation configuration is not valid YAML: ${error.message}`);
}

if (ci && monitor && dependabot) {
  const ciTriggers = Object.keys(ci.on ?? {});
  const monitorTriggers = Object.keys(monitor.on ?? {});

  assert(ciTriggers.includes("pull_request"), "CI does not run on pull requests");
  assert(ciTriggers.includes("push"), "CI does not run on push");
  assert(/npm ci/.test(ciText), "CI does not install the locked dependencies");
  assert(/npm run verify/.test(ciText), "CI does not run the full verification");

  assert(monitorTriggers.includes("schedule"), "the live monitor has no schedule");
  assert(monitorTriggers.includes("workflow_dispatch"), "the live monitor cannot be run by hand");
  assert(/v1\/health/.test(monitorText), "the monitor does not ask the live API for its health");
  assert(
    /ageSeconds/.test(monitorText) && /12/.test(monitorText),
    "the monitor does not reject a stale dataset",
  );
  assert(/::error/.test(monitorText), "the monitor has no failure reporting");
  assert(
    /gh issue create/.test(monitorText) && /gh issue close/.test(monitorText),
    "a stale API does not open and close an issue",
  );
  assert(/HEARTBEAT_URL/.test(monitorText), "a stopped schedule has no heartbeat");

  const ecosystems = (dependabot.updates ?? []).map((update) => update["package-ecosystem"]);
  assert(ecosystems.includes("npm"), "dependabot does not watch npm");
  assert(ecosystems.includes("github-actions"), "dependabot does not watch pinned actions");
}

// The server wrapper is the only thing that writes the published dataset.
for (const marker of [
  "HF_TOKEN",
  "Hugging Face rejected HF_TOKEN",
  '"crawl"',
  '"build"',
  '"stats"',
  "scripts/verify/gate.mjs",
  "HAPI_DATASET_DIR",
  "v1/health",
]) {
  assert(wrapper.includes(marker), `the server refresh does not contain \`${marker}\``);
}
// An unpinned action is a mutable pointer running with a repository token.
for (const file of readdirSync(join(root, ".github", "workflows"))) {
  if (!file.endsWith(".yml")) continue;
  const text = read(`.github/workflows/${file}`);
  assert(
    !/pull_request_target/.test(text),
    `${file} uses pull_request_target, which hands secrets to fork pull requests`,
  );
  for (const line of text.split("\n")) {
    const match = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
    if (!match) continue;
    assert(
      /@[0-9a-f]{40}$/.test(match[1]),
      `${file}: action is not pinned to a commit SHA: ${match[1]}`,
    );
  }
}

if (failures.length > 0) {
  console.error("AUTOMATION VERIFICATION FAILED");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log("AUTOMATION VERIFIED: CI, self-hosted refresh and live monitoring");
