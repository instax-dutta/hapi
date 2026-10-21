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
import { compareCanonical } from "../../src/core/scoring.ts";

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
const creatorsDoc = read("creators.json");
const statsDoc = read("stats.json");

if (failures.length > 0) {
  console.error("DATASET VERIFICATION FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const models = modelsDoc.origins;
const recipes = recipesDoc.recipes;
const repos = reposDoc.repos;
const creators = creatorsDoc.creators;
const stats = statsDoc;

const modelById = new Map(models.map((model) => [model.id, model]));
const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const repoById = new Map(repos.map((repo) => [repo.id, repo]));

if (meta.counts.models !== models.length) fail("meta.counts.models does not match the rows.");
if (meta.counts.recipes !== recipes.length) fail("meta.counts.recipes does not match the rows.");
if (meta.counts.repos !== repos.length) fail("meta.counts.repos does not match the rows.");
if (meta.counts.creators !== creators.length) fail("meta.counts.creators does not match the rows.");

// The totals must be derivable from the rows. A dataset that claims a
// thousand artifacts while holding ten is lying to every client.
//
// The totals describe the whole crawl. The published rows are the verified
// part of it, so the indexed count is the larger one and the two differ by
// the artifacts the directory could not place.
if (meta.totals.origins !== models.length) fail("meta.totals.origins does not match the rows.");
if (meta.totals.recipes !== recipes.length) fail("meta.totals.recipes does not match the rows.");
if (meta.totals.verifiedRepos !== repos.length) {
  fail("meta.totals.verifiedRepos does not match the published artifacts.");
}
if (meta.totals.repos < repos.length) {
  fail("meta.totals.repos is smaller than the published artifacts.");
}
if (meta.totals.unverifiedRepos !== meta.totals.repos - meta.totals.verifiedRepos) {
  fail("meta.totals.unverifiedRepos does not match the difference of the two counts.");
}
if (meta.totals.rankedRecipes !== recipes.filter((recipe) => recipe.ranked).length) {
  fail("meta.totals.rankedRecipes does not match the rows.");
}
const downloadsAllTime = repos.reduce((sum, repo) => sum + repo.downloadsAllTime, 0);
if (meta.totals.downloadsAllTime !== downloadsAllTime) {
  fail("meta.totals.downloadsAllTime does not match the rows.");
}

// The statistics lead with the reach: every model the tag-and-name index
// found. The indexed scope is the subset the directory publishes, and that is
// the one that has to agree with the artifacts.
if (!stats.indexed) fail("stats.indexed is missing.");
if (stats.indexed.modelCount !== repos.length) {
  fail("stats.indexed.modelCount does not match the artifacts.");
}
if (stats.indexed.allTimeDownloads !== downloadsAllTime) {
  fail("stats.indexed.allTimeDownloads does not match the artifacts.");
}
if (stats.totals.modelCount < stats.indexed.modelCount) {
  fail("stats.totals.modelCount is smaller than the published artifacts.");
}
if (stats.totals.allTimeDownloads < stats.indexed.allTimeDownloads) {
  fail("stats.totals.allTimeDownloads is smaller than the published artifacts.");
}
if (stats.rate.basis !== "derived") fail("stats.rate is not labelled as derived.");

// Every creator's totals are the sum of the models it lists. The list comes
// from the discovery, so a creator can publish models the directory could not
// classify, and the arithmetic still has to hold.
for (const creator of creators) {
  if (creator.totals.modelCount !== creator.models.length) {
    fail(`The creator ${creator.username} claims ${creator.totals.modelCount} models and lists ${creator.models.length}.`);
  }
  const allTime = creator.models.reduce((sum, model) => sum + model.downloadsAllTime, 0);
  if (creator.totals.allTimeDownloads !== allTime) {
    fail(`The creator ${creator.username} claims ${creator.totals.allTimeDownloads} all-time downloads and its models sum to ${allTime}.`);
  }
  const recent = creator.models.reduce((sum, model) => sum + model.downloads, 0);
  if (creator.totals.last30DaysDownloads !== recent) {
    fail(`The creator ${creator.username} claims ${creator.totals.last30DaysDownloads} recent downloads and its models sum to ${recent}.`);
  }
  if (new Set(creator.models.map((model) => model.id)).size !== creator.models.length) {
    fail(`The creator ${creator.username} lists the same model twice.`);
  }
}
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
    // A divergence of zero is allowed: it is below the floor an ablation can
    // produce, so the row is flagged implausible rather than dropped. What is
    // not allowed is a negative divergence.
    if (!(recipe.kl >= 0)) fail(`The ranked recipe ${recipe.id} has a negative KL.`);
    if (recipe.refusals > recipe.refusalTotal) {
      fail(`The ranked recipe ${recipe.id} has more refusals than tests.`);
    }
    if (!(recipe.score > 0)) fail(`The ranked recipe ${recipe.id} has no score.`);
    if (recipe.kl === 0 && !recipe.implausible) {
      fail(`The recipe ${recipe.id} has a zero divergence but is not flagged implausible.`);
    }
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
//
// Only the ranked recipes take part: an unranked recipe has no measurement to
// dominate anything with, and the publisher keeps it off the frontier.
for (const model of models) {
  const cohort = recipes.filter(
    (recipe) => recipe.originId === model.id && recipe.ranked,
  );
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
    if (dominated && recipe.pareto) {
      fail(`The recipe ${recipe.id} is dominated but is marked as on the frontier.`);
    }
  }
  for (const recipe of recipes.filter((row) => row.originId === model.id && !row.ranked)) {
    if (recipe.pareto) fail(`The unranked recipe ${recipe.id} is marked as on the frontier.`);
    if (recipe.rank !== null) fail(`The unranked recipe ${recipe.id} claims a rank.`);
  }
}

for (const repo of repos) {
  if (repo.recipeId && !recipeById.has(repo.recipeId)) {
    fail(`The artifact ${repo.id} names an unknown recipe ${repo.recipeId}.`);
  }
  if (!repo.originId) fail(`The artifact ${repo.id} has no origin.`);
  if (!repo.url) fail(`The artifact ${repo.id} has no URL.`);
}

// The ranks are recomputed from the published rows, with the same comparator
// the publisher uses, so the rank column and the default sort cannot drift
// apart. The comparator is imported, not copied.
const ranked = recipes.filter((recipe) => recipe.ranked);
const ordered = [...ranked].sort(compareCanonical);
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
