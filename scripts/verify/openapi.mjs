#!/usr/bin/env node
/**
 * Prove the OpenAPI description and the implemented routes still agree.
 *
 * Four checks:
 *   1. `docs/openapi.json` is exactly what the spec module generates
 *   2. every path in the description is a route the handler serves
 *   3. every route the handler serves is a path in the description
 *   4. every parameter a route reads is described, and every parameter a
 *      route describes is read
 *
 * The fourth check is the one that matters. A parameter the description
 * advertises and the route ignores is a filter that silently returns
 * everything, which is worse than a rejected request.
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
const indexSource = readFileSync(join(root, "src", "index.ts"), "utf8");
const routePattern = /\{\s*method:\s*"(\w+)",\s*pattern:\s*"([^"]+)",\s*handler:\s*(\w+)\.(\w+)\s*\}/g;
const routes = [...indexSource.matchAll(routePattern)].map((match) => ({
  method: match[1],
  pattern: match[2],
  module: match[3],
  handler: match[4],
}));

/** `/v1/models/:id*` and `/v1/models/{id}` name the same route. */
const normalise = (pattern) => pattern.replace(/\{(\w+)\}/g, ":$1").replace(/\*$/, "");

const described = Object.keys(openapiDocument.paths);

for (const route of routes) {
  const path = normalise(route.pattern);
  const describedPath = described.find((candidate) => normalise(candidate) === path);
  if (!describedPath) {
    fail(`The route ${route.pattern} is not described in the OpenAPI document.`);
    continue;
  }
}

for (const path of described) {
  const covered = routes.some((route) => normalise(route.pattern) === normalise(path));
  if (!covered) {
    fail(`The described path ${path} has no route in src/index.ts.`);
  }
}

/** The source of one route module. */
function moduleSource(module) {
  return readFileSync(join(root, "src", "routes", `${module}.ts`), "utf8");
}

/** The body of one exported route handler. */
function handlerBody(module, handler) {
  const source = moduleSource(module);
  const start = source.indexOf(`export async function ${handler}(`);
  if (start === -1) return null;
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/**
 * The query parameters a piece of code reads.
 *
 * Both shapes count: `query.family` reads a parsed parameter, and
 * `query.get("repo")` reads a raw one.
 */
function readsQuery(body) {
  const names = new Set();
  // `query.family` reads a parsed parameter. The lookbehind keeps an import
  // path such as "../lib/query.ts" from being read as a parameter.
  for (const match of body.matchAll(/(?<![/\w'"])query\.(?!get\b|has\b|set\b)(\w+)\b/g)) {
    names.add(match[1]);
  }
  // `query.get("repo")` reads a raw one.
  for (const match of body.matchAll(/(?<![/\w'"])query\.(?:get|has)\(\s*"([^"]+)"/g)) {
    names.add(match[1]);
  }
  // `numberParam(query, "seconds", 60)` reads one by name.
  for (const match of body.matchAll(/\(\s*query\s*,\s*"([^"]+)"/g)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * The parameters every list endpoint reads through the query engine.
 *
 * The engine parses them, so the route never names them.
 */
const SHARED = new Set(["sort", "dir", "page", "perPage"]);

/** Every parameter name the API offers, across every path. */
const vocabulary = new Set(
  Object.values(openapiDocument.paths).flatMap((entry) =>
    (entry.get?.parameters ?? [])
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name),
  ),
);

for (const route of routes) {
  const path = normalise(route.pattern);
  const describedPath = described.find((candidate) => normalise(candidate) === path);
  if (!describedPath) continue;

  const body = handlerBody(route.module, route.handler);
  if (body === null) {
    fail(`The handler ${route.module}.${route.handler} was not found.`);
    continue;
  }

  const declared = new Set(
    (openapiDocument.paths[describedPath].get?.parameters ?? [])
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name),
  );

  // A list endpoint delegates the filters to a matching function in the same
  // module, so the module's reads are the endpoint's reads.
  const isList = body.includes("parseQuery(");
  const read = readsQuery(body);
  if (isList) {
    for (const name of readsQuery(moduleSource(route.module))) read.add(name);
    for (const name of SHARED) read.add(name);
  }

  for (const name of declared) {
    if (!read.has(name)) {
      fail(`The route ${route.pattern} describes the parameter "${name}" and does not read it.`);
    }
  }
  // A read that is not a client parameter is an internal field, like the
  // parsed boundary the query engine hands over. A read that IS a client
  // parameter and is not described for this path is a filter the client
  // cannot discover.
  for (const name of read) {
    if (vocabulary.has(name) && !declared.has(name)) {
      fail(`The route ${route.pattern} reads the parameter "${name}" and does not describe it.`);
    }
  }
}

// Every path describes what it returns, and every schema is used.
const referenced = new Set();
const scan = (node) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.$ref === "string") referenced.add(node.$ref);
  for (const value of Object.values(node)) scan(value);
};
scan(openapiDocument.paths);
scan(openapiDocument.components.schemas);

for (const [path, entry] of Object.entries(openapiDocument.paths)) {
  const success = entry.get.responses["200"];
  if (!success.content) {
    fail(`The path ${path} does not describe the document it returns.`);
  }
}
for (const name of Object.keys(openapiDocument.components.schemas)) {
  if (!referenced.has(`#/components/schemas/${name}`)) {
    fail(`The schema ${name} is defined and never referenced.`);
  }
}

if (failures.length > 0) {
  console.error("OPENAPI VERIFICATION FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `OPENAPI VERIFIED: ${described.length} documented paths, ${routes.length} implemented routes`,
);
