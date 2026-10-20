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
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { apiRowsFromSnapshot } from "./lib/dataset-rows.ts";

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

const families = snapshot.families.filter((family) =>
  keptModels.some((model) => model.familySlug === family.slug),
);

const meta = {
  ...full.meta,
  generatedAt: snapshot.updatedAt,
  totals: {
    ...full.meta.totals,
    origins: keptModels.length,
    recipes: keptRecipes.length,
    repos: keptRepos.length,
  },
  families,
  counts: {
    models: keptModels.length,
    recipes: keptRecipes.length,
    repos: keptRepos.length,
  },
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2));
writeFileSync(join(out, "models.json"), JSON.stringify({ origins: keptModels }));
writeFileSync(join(out, "recipes.json"), JSON.stringify({ recipes: keptRecipes }));
writeFileSync(join(out, "repos.json"), JSON.stringify({ repos: keptRepos }));

console.log(
  `Sample written to ${out}: ${keptModels.length} models, ${keptRecipes.length} recipes, ${keptRepos.length} artifacts`,
);
