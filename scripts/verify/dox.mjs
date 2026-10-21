#!/usr/bin/env node
/**
 * Prove the DOX tree is complete and internally consistent.
 *
 * The checks:
 *   1. every AGENTS.md has the required sections
 *   2. every child AGENTS.md is listed in its parent's Child DOX Index
 *   3. every path listed in a Child DOX Index exists
 *   4. no document carries an emoji or an em dash
 *
 * The success marker is printed only after every check passes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const failures = [];
const fail = (message) => failures.push(message);

const REQUIRED_SECTIONS = [
  "## Purpose",
  "## Ownership",
  "## Local Contracts",
  "## Work Guidance",
  "## Verification",
  "## Child DOX Index",
];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function findDocs(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...findDocs(path));
      continue;
    }
    if (entry.name === "AGENTS.md") found.push(path);
  }
  return found;
}

const docs = findDocs(root);
if (docs.length === 0) fail("No AGENTS.md was found in the repository.");

for (const path of docs) {
  const relativePath = relative(root, path);
  const text = readFileSync(path, "utf8");
  const isRoot = path === join(root, "AGENTS.md");

  // The root is the rail. It carries the DOX contract and the project rules,
  // so it is exempt from the child section shape.
  const required = isRoot ? ["## Child DOX Index"] : REQUIRED_SECTIONS;
  for (const section of required) {
    if (!text.includes(section)) {
      fail(`${relativePath} is missing the section "${section}".`);
    }
  }

  if (EMOJI.test(text)) fail(`${relativePath} contains an emoji.`);
  if (text.includes("—")) fail(`${relativePath} contains an em dash.`);

  // The Child DOX Index must list every direct child document.
  const directory = resolve(path, "..");
  const children = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const childDoc = join(directory, entry.name, "AGENTS.md");
    if (existsSync(childDoc)) children.push(childDoc);
  }

  const indexStart = text.indexOf("## Child DOX Index");
  const index = indexStart === -1 ? "" : text.slice(indexStart);
  for (const child of children) {
    const childRelative = relative(root, child);
    if (!index.includes(childRelative)) {
      fail(`${relativePath} does not list ${childRelative} in its Child DOX Index.`);
    }
  }

  // Every path the index names must exist.
  for (const match of index.matchAll(/`([^`]+)`/g)) {
    const named = match[1];
    if (!named.includes("/")) continue;
    if (!existsSync(join(root, named))) {
      fail(`${relativePath} names ${named}, which does not exist.`);
    }
  }
}

if (failures.length > 0) {
  console.error("DOX VERIFICATION FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`DOX VERIFIED: ${docs.length} documents checked`);
