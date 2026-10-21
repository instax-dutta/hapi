#!/usr/bin/env node
/**
 * Build the committed sample dataset from a directory snapshot.
 *
 *   node scripts/make-sample.mjs <snapshot.json> [out directory]
 *
 * The sample keeps whole cohorts: every recipe of every origin it keeps, and
 * every artifact of every recipe it keeps. A cohort that lost a member would
 * change its Pareto frontier, and the sample would then disagree with the
 * invariant the gate checks.
 *
 * Everything the sample publishes is re-derived from the slice. A sample that
 * carried the full corpus's totals, facets and version would claim numbers
 * that are not derivable from the rows it holds.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  apiRowsFromSnapshot,
  assignModelRanks,
  assignRanks,
  buildFacets,
} from "./lib/dataset-rows.ts";
import { buildCreators } from "./lib/creators.ts";
import { aggregate, estimateDownloadsPerSecond, LIVE_RATE_WINDOW_DAYS } from "../src/core/live.ts";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/make-sample.mjs <snapshot.json> [out directory]");
  process.exit(2);
}

const root = resolve(process.cwd());
const out = resolve(root, process.argv[3] ?? join("test", "fixtures", "dataset"));
const limit = Number(process.env.HAPI_SAMPLE_MODELS ?? 40);

const snapshot = JSON.parse(readFileSync(resolve(root, source), "utf8"));
const full = apiRowsFromSnapshot(snapshot);

const keptModels = full.models.slice(0, limit);
const keptModelIds = new Set(keptModels.map((model) => model.id));
const keptRecipes = full.recipes.filter((recipe) => keptModelIds.has(recipe.originId));
const keptRecipeIds = new Set(keptRecipes.map((recipe) => recipe.id));
const keptRepos = full.repos.filter(
  (repo) => repo.recipeId && keptRecipeIds.has(repo.recipeId),
);

// The sample is a slice, so its ranks are the ranks inside the slice. A rank
// from the whole corpus would point at rows the sample does not publish.
assignRanks(keptRecipes);
assignModelRanks(keptModels);

// Everything derived is derived again from the slice. The sample has no
// discovery of its own, so the creators are cut from the slice's artifacts.
const keptCreators = buildCreators(
  keptRepos.map((repo) => ({
    id: repo.id,
    author: repo.author,
    downloads30d: repo.downloads30d,
    downloadsAllTime: repo.downloadsAllTime,
    likes: repo.likes,
  })),
  keptRecipes,
  keptRepos,
  snapshot.updatedAt,
);
const facets = buildFacets(keptRecipes, keptRepos, keptModels);

const measured = keptRepos.map((repo) => ({
  id: repo.id,
  downloads: repo.downloads30d,
  downloadsAllTime: repo.downloadsAllTime,
  likes: repo.likes,
  source: "tagged",
}));
const totals = aggregate(measured);

const version = createHash("sha256")
  .update(JSON.stringify({ models: keptModels, recipes: keptRecipes, repos: keptRepos, creators: keptCreators }))
  .digest("hex")
  .slice(0, 12);

const meta = {
  version,
  generatedAt: snapshot.updatedAt,
  generator: "hapi",
  source: snapshot.source,
  totals: {
    repos: keptRepos.length,
    verifiedRepos: keptRepos.length,
    unverifiedRepos: 0,
    origins: keptModels.length,
    recipes: keptRecipes.length,
    rankedRecipes: keptRecipes.filter((recipe) => recipe.ranked).length,
    directConversions: keptRepos.filter((repo) => repo.isDirectConversion).length,
    downloadsAllTime: totals.allTimeDownloads,
    downloads30d: totals.last30DaysDownloads,
  },
  families: snapshot.families.filter((family) =>
    keptModels.some((model) => model.familySlug === family.slug),
  ),
  counts: {
    models: keptModels.length,
    recipes: keptRecipes.length,
    repos: keptRepos.length,
    creators: keptCreators.length,
  },
  facets,
};

const stats = {
  scope: "global",
  username: null,
  updatedAt: snapshot.updatedAt,
  totals,
  rate: {
    downloadsPerSecond: estimateDownloadsPerSecond(totals.last30DaysDownloads),
    windowDays: LIVE_RATE_WINDOW_DAYS,
    basis: "derived",
  },
  source: "Hugging Face Hub API",
  indexed: totals,
  indexedRate: {
    downloadsPerSecond: estimateDownloadsPerSecond(totals.last30DaysDownloads),
    windowDays: LIVE_RATE_WINDOW_DAYS,
    basis: "derived",
  },
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2));
writeFileSync(join(out, "models.json"), JSON.stringify({ origins: keptModels }));
writeFileSync(join(out, "recipes.json"), JSON.stringify({ recipes: keptRecipes }));
writeFileSync(join(out, "repos.json"), JSON.stringify({ repos: keptRepos }));
writeFileSync(join(out, "creators.json"), JSON.stringify({ creators: keptCreators }));
writeFileSync(join(out, "stats.json"), JSON.stringify(stats, null, 2));
writeFileSync(
  join(out, "dataset.json"),
  JSON.stringify({
    meta,
    models: keptModels,
    recipes: keptRecipes,
    repos: keptRepos,
    creators: keptCreators,
  }),
);

console.log(
  `Sample written to ${out}: ${keptModels.length} models, ${keptRecipes.length} recipes, ${keptRepos.length} artifacts, ${keptCreators.length} creators`,
);
