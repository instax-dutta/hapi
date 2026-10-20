#!/usr/bin/env node
/**
 * Prove the OpenAPI description and the implemented routes still agree.
 *
 * Three checks:
 *   1. `docs/openapi.json` is exactly what the spec module generates
 *   2. every path in the description is a route the handler serves
 *   3. every route the handler serves is a path in the description
 *
 * The success marker is printed only after every check passes.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openapiDocument } from "../../src/routes/openapi-spec.ts";

const root = resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

const committed = join(root, "docs", "openapi.json");
let committedText = "";
try {
  committedText = readFileSync(committed, "utf8");
} catch {
  fail("docs/openapi.json is missing. Run `node scripts/build-openapi.mjs`.");
}

if (committedText) {
  const generated = `${JSON.stringify(openapiDocument, null, 2)}\n`;
  if (committedText !== generated) {
    fail("docs/openapi.json is out of date. Run `node scripts/build-openapi.mjs`.");
  }
}

// The route table, read from the handler module rather than a second copy.
const routeSource = readFileSync(join(root, "src", "index.ts"), "utf8");
const patterns = [...routeSource.matchAll(/pattern:\s*"([^"]+)"/g)].map((match) => match[1]);

const described = Object.keys(openapiDocument.paths);

for (const pattern of patterns) {
  if (pattern === "/v1") {
    if (!described.includes("/v1")) fail("The route /v1 is not described.");
    continue;
  }
  const base = pattern.replace(/:[a-zA-Z*]+$/, "").replace(/\/\*$/, "");
  const describedPath = described.find((path) => path.startsWith(base));
  if (!describedPath) {
    fail(`The route ${pattern} is not described in the OpenAPI document.`);
  }
}

for (const path of described) {
  if (path === "/v1") continue;
  const covered = patterns.some((pattern) => {
    const base = pattern.replace(/:[a-zA-Z*]+$/, "").replace(/\/\*$/, "");
    return base === path;
  });
  if (!covered) {
    fail(`The described path ${path} has no route in src/index.ts.`);
  }
}

if (failures.length > 0) {
  console.error("OPENAPI VERIFICATION FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `OPENAPI VERIFIED: ${described.length} documented paths, ${patterns.length} implemented routes`,
);
