#!/usr/bin/env node
/**
 * Prove the published dataset satisfies its invariants.
 *
 * The dataset is the single source of truth for every number the API serves,
 * so a dataset that breaks an invariant breaks the API's promises. The checks
 * are re-derived from the published rows, never copied from the build.
 *
 * By default the committed sample under `test/fixtures/dataset` is checked,
 * so the gate runs everywhere. Set `HAPI_DATASET_DIR` to check a real build.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const directory = process.env.HAPI_DATASET_DIR
  ? resolve(root, process.env.HAPI_DATASET_DIR)
  : join(root, "test", "fixtures", "dataset");

const failures = [];
const fail = (message) => failures.push(message);

if (!existsSync(directory)) {
  console.error(`DATASET VERIFICATION FAILED: ${directory} does not exist`);
  process.exit(1);
}

function read(name) {
  const path = join(directory, name);
  if (!existsSync(path)) {
    fail(`${name} is missing from ${directory}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${name} is not valid JSON: ${error.message}`);
    return null;
  }
}

const meta = read("meta.json");
const modelsDoc = read("models.json");
const recipesDoc = read("recipes.json");
const reposDoc = read("repos.json");

if (failures.length > 0) {
  console.error("DATASET VERIFICATION FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const models = modelsDoc.origins;
const recipes = recipesDoc.recipes;
const repos = reposDoc.repos;

const modelById = new Map(models.map((model) => [model.id, model]));
const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const repoById = new Map(repos.map((repo) => [repo.id, repo]));

if (meta.counts.models !== models.length) fail("meta.counts.models does not match the rows.");
if (meta.counts.recipes !== recipes.length) fail("meta.counts.recipes does not match the rows.");
if (meta.counts.repos !== repos.length) fail("meta.counts.repos does not match the rows.");
if (!meta.version) fail("meta.version is empty.");
if (!Number.isFinite(Date.parse(meta.generatedAt))) fail("meta.generatedAt is not a date.");

for (const recipe of recipes) {
  if (!modelById.has(recipe.originId)) {
    fail(`The recipe ${recipe.id} names an unknown origin ${recipe.originId}.`);
  }
  if (!repoById.has(recipe.evidenceRepoId)) {
    fail(`The recipe ${recipe.id} names an unknown evidence repo ${recipe.evidenceRepoId}.`);
  }
  if (recipe.ranked) {
    if (!(recipe.kl > 0)) fail(`The ranked recipe ${recipe.id} has a non-positive KL.`);
    if (recipe.refusals > recipe.refusalTotal) {
      fail(`The ranked recipe ${recipe.id} has more refusals than tests.`);
    }
    if (!(recipe.score > 0)) fail(`The ranked recipe ${recipe.id} has no score.`);
  } else if (recipe.score !== 0) {
    fail(`The unranked recipe ${recipe.id} has a score of ${recipe.score}.`);
  }
  if (recipe.implausible && recipe.kl >= 1e-4) {
    fail(`The recipe ${recipe.id} is flagged implausible but its KL is ${recipe.kl}.`);
  }
  if (recipe.verification === "unverified" && recipe.bestPick) {
    fail(`The unverified recipe ${recipe.id} holds a best pick.`);
  }
  if (recipe.repoCount < 0) {
    fail(`The recipe ${recipe.id} has a negative artifact count.`);
  }
}

// The Pareto flags are re-derived from the published rows.
for (const model of models) {
  const cohort = recipes.filter((recipe) => recipe.originId === model.id);
  for (const recipe of cohort) {
    const dominated = cohort.some((other) => {
      if (other.id === recipe.id) return false;
      const atLeastAsGood = other.kl <= recipe.kl && other.refusalRate <= recipe.refusalRate;
      const strictlyBetter = other.kl < recipe.kl || other.refusalRate < recipe.refusalRate;
      return atLeastAsGood && strictlyBetter;
    });
    if (!dominated && !recipe.pareto) {
      fail(`The recipe ${recipe.id} is on the frontier but is not marked as such.`);
    }
  }
}

for (const repo of repos) {
  if (repo.recipeId && !recipeById.has(repo.recipeId)) {
    fail(`The artifact ${repo.id} names an unknown recipe ${repo.recipeId}.`);
  }
  if (!repo.originId) fail(`The artifact ${repo.id} has no origin.`);
  if (!repo.url) fail(`The artifact ${repo.id} has no URL.`);
}

// The ranks are recomputed from the published rows, so the rank column and the
// default sort cannot drift apart.
const ranked = recipes.filter((recipe) => recipe.ranked);
const verifiedFirst = (recipe) =>
  recipe.verification === "verified" || recipe.verification === "publisher";
const ordered = [...ranked].sort(
  (a, b) =>
    Number(verifiedFirst(b)) - Number(verifiedFirst(a)) ||
    b.score - a.score ||
    a.kl - b.kl ||
    a.refusalRate - b.refusalRate ||
    a.id.localeCompare(b.id),
);
ordered.forEach((recipe, index) => {
  if (recipe.rank !== index + 1) {
    fail(`The recipe ${recipe.id} claims rank ${recipe.rank} but holds ${index + 1}.`);
  }
});

// Every recipe's numbers match the artifact it cites as evidence.
for (const recipe of recipes) {
  const evidence = repoById.get(recipe.evidenceRepoId);
  if (!evidence) continue;
  if (evidence.kl !== recipe.kl) {
    fail(`The recipe ${recipe.id} and its evidence artifact disagree about the KL.`);
  }
  if (evidence.refusals !== recipe.refusals) {
    fail(`The recipe ${recipe.id} and its evidence artifact disagree about the refusals.`);
  }
}

if (failures.length > 0) {
  console.error("DATASET VERIFICATION FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `DATASET VERIFIED: ${models.length} models, ${recipes.length} recipes, ${repos.length} artifacts`,
);
