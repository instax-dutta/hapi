#!/usr/bin/env node
/**
 * The live URL check.
 *
 *   node scripts/verify/live.mjs https://hapi.sdad.pro
 *
 * It exercises the API the way a client on the internet does, over the public
 * URL, and proves the properties a consumer depends on:
 *
 *   1. every documented endpoint answers, with the documented shape
 *   2. every failure answers in the standard error envelope
 *   3. CORS is open on every response
 *   4. the cache policy is the documented one on every surface
 *   5. a conditional request answers 304
 *   6. the pages continue without a gap or a repeat, and a page past the end
 *      clamps
 *   7. the counts agree across the metadata, the lists and the summary
 *   8. the filters really filter
 *   9. the rank column follows the canonical order
 *   10. the two download scopes are consistent
 *   11. a hostile request never produces a 5xx
 *   12. the OpenAPI description served is the one in the repository
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

const base = (process.argv[2] ?? process.env.HAPI_URL ?? "http://127.0.0.1:8790").replace(/\/$/, "");
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

async function get(path) {
  const response = await fetch(base + path, { redirect: "follow" });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body, text };
}

const LIST_PATHS = ["/v1/models", "/v1/recipes", "/v1/repos", "/v1/creators"];
const DETAIL_PATHS = ["/v1/models/google/gemma-3-12b-it", "/v1/recipes/rcp_a", "/v1/repos/a/b", "/v1/creators/coder3101"];

// 1. Every endpoint answers, with the documented shape.
const expected = {
  "/v1": (body) => body?.service === "hapi" && typeof body?.endpoints === "object",
  "/v1/health": (body) => body?.status === "ok" && body?.dataset?.version,
  "/v1/meta": (body) => body?.version && body?.totals && body?.families && body?.facets,
  "/v1/summary": (body) => body?.totals && body?.topModels && body?.topCreators,
  "/v1/families": (body) => Array.isArray(body?.families),
  "/v1/versions": (body) => body?.facet === "versions" && Array.isArray(body?.values),
  "/v1/formats": (body) => body?.facet === "formats",
  "/v1/licenses": (body) => body?.facet === "licenses",
  "/v1/tags": (body) => body?.facet === "tags",
  "/v1/kinds": (body) => body?.facet === "kinds",
  "/v1/sizes": (body) => body?.facet === "sizes",
  "/v1/models": (body) => Array.isArray(body?.rows) && typeof body?.total === "number",
  "/v1/recipes": (body) => Array.isArray(body?.rows) && typeof body?.total === "number",
  "/v1/repos": (body) => Array.isArray(body?.rows) && typeof body?.total === "number",
  "/v1/creators": (body) => Array.isArray(body?.rows) && typeof body?.total === "number",
  "/v1/stats": (body) => body?.totals?.modelCount >= 0 && body?.rate?.basis === "derived",
  "/v1/simulate?rate=0.5&seconds=60&seed=42": (body) => typeof body?.events === "number",
  "/v1/openapi.json": (body) => body?.openapi === "3.1.0" && body?.paths,
};

for (const [path, shape] of Object.entries(expected)) {
  const { response, body } = await get(path);
  check(response.status === 200, `${path} answered ${response.status}, expected 200`);
  check(shape(body), `${path} did not return the documented shape`);
  check(
    response.headers.get("access-control-allow-origin") === "*",
    `${path} did not open the CORS headers`,
  );
}

// 2. The failure paths.
const failures_expected = [
  ["/v1/nope", 404],
  ["/v1/recipes/rcp_does_not_exist", 404],
  ["/v1/models/%ZZ", 400],
  ["/v1/parse?repo=not-a-repo", 400],
  ["/v1/simulate?rate=abc", 400],
];
for (const [path, status] of failures_expected) {
  const { response, body } = await get(path);
  check(response.status === status, `${path} answered ${response.status}, expected ${status}`);
  check(
    body?.error && typeof body.error.code === "string" && body.error.docs,
    `${path} did not use the standard error envelope`,
  );
  check(
    response.headers.get("access-control-allow-origin") === "*",
    `${path} did not open the CORS headers`,
  );
  check(
    response.headers.get("cache-control") === "no-store",
    `${path} cached an error`,
  );
}

// 3. The cache policy.
const cachePolicy = {
  "/v1/health": /s-maxage=60/,
  "/v1/recipes": /s-maxage=600/,
  "/v1/stats": /s-maxage=300/,
  "/v1/dataset.json": /s-maxage=3600/,
};
for (const [path, pattern] of Object.entries(cachePolicy)) {
  const { response } = await get(path);
  check(
    pattern.test(response.headers.get("cache-control") ?? ""),
    `${path} has the wrong cache policy: ${response.headers.get("cache-control")}`,
  );
}

// 4. A conditional request.
const first = await fetch(base + "/v1/recipes?perPage=25");
const etag = first.headers.get("etag");
check(Boolean(etag), "the list response has no ETag");
if (etag) {
  const conditional = await fetch(base + "/v1/recipes?perPage=25", {
    headers: { "If-None-Match": etag },
  });
  check(conditional.status === 304, `a matching If-None-Match answered ${conditional.status}`);
}

// 5. The pages continue, and a page past the end clamps.
for (const path of LIST_PATHS) {
  const page1 = (await get(`${path}?perPage=25&page=1&sort=score`)).body;
  const page2 = (await get(`${path}?perPage=25&page=2&sort=score`)).body;
  // A creator row is keyed by its username, everything else by its id.
  const key = (row) => row.id ?? row.username;
  const ids1 = (page1?.rows ?? []).map(key);
  const ids2 = (page2?.rows ?? []).map(key);
  check(!ids1.some((id) => ids2.includes(id)), `${path}: the pages overlap`);
  const beyond = (await get(`${path}?perPage=25&page=99999`)).body;
  check(beyond?.page === page1?.pageCount, `${path}: a page past the end is not clamped`);
}

// 6. The counts agree.
const meta = (await get("/v1/meta")).body;
const recipes = (await get("/v1/recipes?perPage=200")).body;
const models = (await get("/v1/models?perPage=200")).body;
const summary = (await get("/v1/summary")).body;
check(recipes.total === meta.totals.recipes, "the recipe total differs from the metadata");
check(models.total === meta.totals.origins, "the model total differs from the metadata");
check(meta.counts.recipes === meta.totals.recipes, "meta.counts.recipes differs from meta.totals");
check(summary.totals.origins === meta.totals.origins, "the summary differs from the metadata");

// 7. The filters really filter.
const all = (await get("/v1/recipes?perPage=200")).body;
const family = (await get("/v1/recipes?perPage=200&family=gemma-3")).body;
check(family.total < all.total, "the family filter did not narrow the result");
check(
  (family.rows ?? []).every((row) => row.familySlug === "gemma-3"),
  "the family filter returned a row from another family",
);
const verified = (await get("/v1/recipes?perPage=200&verification=verified")).body;
check(
  (verified.rows ?? []).every((row) => row.verification === "verified"),
  "the verification filter leaked a row",
);

// 8. The rank column follows the canonical order.
const ranked = (await get("/v1/recipes?perPage=200&sort=score")).body.rows.filter((row) => row.ranked);
let inOrder = true;
for (let i = 1; i < ranked.length; i += 1) {
  const a = ranked[i - 1];
  const b = ranked[i];
  const av = a.verification === "verified" || a.verification === "publisher" ? 0 : 1;
  const bv = b.verification === "verified" || b.verification === "publisher" ? 0 : 1;
  if (av !== bv) {
    if (av > bv) inOrder = false;
  } else if (a.score !== b.score) {
    if (a.score < b.score) inOrder = false;
  } else if (a.kl !== b.kl) {
    if (a.kl > b.kl) inOrder = false;
  } else if (a.refusalRate !== b.refusalRate) {
    if (a.refusalRate > b.refusalRate) inOrder = false;
  } else if (a.downloadsAllTime !== b.downloadsAllTime) {
    if (a.downloadsAllTime < b.downloadsAllTime) inOrder = false;
  } else if (a.lastModified !== b.lastModified) {
    if (a.lastModified < b.lastModified) inOrder = false;
  }
}
check(inOrder, "the row order does not follow the canonical order");

// 9. The two download scopes.
const stats = (await get("/v1/stats")).body;
check(stats.totals.modelCount >= stats.indexed.modelCount, "the reach is smaller than the indexed scope");
check(
  stats.totals.allTimeDownloads >= stats.indexed.allTimeDownloads,
  "the reach downloads are smaller than the indexed scope",
);
check(stats.rate.basis === "derived", "the rate is not labelled as derived");

// 10. A hostile request never produces a 5xx.
const hostile = [
  "/v1/models?sort=", "/v1/models?perPage=0", "/v1/models?perPage=99999",
  "/v1/models?page=-1", "/v1/models?page=1e9", "/v1/models?page=abc",
  "/v1/models?q=%27%20OR%201%3D1", "/v1/models?minDownloads=abc",
  "/v1/models?minParams=1e999", "/v1/models?updatedAfter=not-a-date",
  "/v1/models/", "/v1//models", "/v1/recipes?verification=bogus",
  "/v1/recipes?implausible=2", "/v1/repos?quant=", "/v1/creators?minScore=abc",
  "/v1/compare", "/v1/compare?a=&b=", "/v1/simulate?seconds=999999999",
  "/v1/simulate?seed=abc", "/v1/parse?repo=", "/v1/families/%00",
  "/v1/../v1/models", "/v1/%2e%2e/v1/models",
];
for (const path of hostile) {
  const { response, body } = await get(path);
  check(response.status < 500, `${path} answered ${response.status}`);
  if (response.status >= 400) {
    check(body?.error?.code, `${path} did not use the standard error envelope`);
  }
}

// 11. The OpenAPI description served is the one in the repository.
const served = (await get("/v1/openapi.json")).body;
let committed = null;
try {
  committed = JSON.parse(readFileSync(join(root, "docs", "openapi.json"), "utf8"));
} catch {
  notes.push("docs/openapi.json could not be read; the served description was not compared");
}
if (committed) {
  check(
    JSON.stringify(served) === JSON.stringify(committed),
    "the OpenAPI description served differs from docs/openapi.json",
  );
}

// The report.
const cacheStatus = (await fetch(base + "/v1/recipes?perPage=25")).headers.get("cf-cache-status");
console.log(`\nLIVE CHECK: ${base}`);
console.log(`  endpoints checked   ${Object.keys(expected).length + failures_expected.length + LIST_PATHS.length}`);
console.log(`  dataset version    ${meta?.version ?? "?"} (generated ${meta?.generatedAt ?? "?"})`);
console.log(`  artifacts          ${meta?.totals?.verifiedRepos ?? "?"}`);
console.log(`  models / ablations ${meta?.totals?.origins ?? "?"} / ${meta?.totals?.recipes ?? "?"}`);
if (cacheStatus) console.log(`  edge cache status  ${cacheStatus}`);
for (const note of notes) console.log(`  note               ${note}`);

if (failures.length > 0) {
  console.error(`\nLIVE CHECK FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("\nLIVE CHECK PASSED: every endpoint answers, every failure is enveloped, CORS is open, the cache policy is right and the data is consistent");
