/**
 * The recipe endpoints.
 *
 * A recipe is one ablation attempt, and this is the leaderboard. Recipes are
 * ranked, never repos: a quantization of one ablation is not a second result
 * and must not take a second row.
 */
import { errorResponse, json } from "../lib/http.ts";
import {
  compareNullable,
  compareText,
  isUpdatedAfter,
  matchesText,
  parseQuery,
  runQuery,
  verificationFirst,
  type CommonQuery,
  type RowComparator,
} from "../lib/query.ts";
import { compareCohort, compareIds, compareVerification } from "../core/scoring.ts";
import type { RecipeRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const RECIPE_SORTS = [
  "score",
  "kl",
  "refusals",
  "refusalRate",
  "downloads",
  "recent",
  "params",
  "newest",
  "model",
  "likes",
  "benchmarks",
  "repos",
] as const;

const DEFAULT_SORT = "score";

function isVerified(row: RecipeRow): boolean {
  return row.verification === "verified" || row.verification === "publisher";
}

function matches(row: RecipeRow, query: CommonQuery): boolean {
  if (query.ranked && !row.ranked) return false;
  if (query.family && row.familySlug !== query.family) return false;
  if (query.size && row.sizeClass !== query.size) return false;
  if (query.format && !row.formats.includes(query.format)) return false;
  if (query.kind && row.kind !== query.kind) return false;
  if (query.version && row.hereticVersion !== query.version) return false;
  if (query.verification && row.verification !== query.verification) return false;
  if (query.confidence && row.confidence !== query.confidence) return false;
  if (query.pareto && !row.pareto) return false;
  if (query.bestPick && !row.bestPick) return false;
  if (query.minDownloads > 0 && row.downloadsAllTime < query.minDownloads) return false;
  if (query.minScore > 0 && row.score < query.minScore) return false;
  if (query.minLikes > 0 && row.likes < query.minLikes) return false;
  if (query.maxKl > 0 && row.kl > query.maxKl) return false;
  if (query.bench && row.benchmarks.length === 0) return false;
  if (query.implausible === "0" && row.implausible) return false;
  if (query.implausible === "1" && !row.implausible) return false;
  if (!isUpdatedAfter(row.lastModified, query.updatedAfter)) return false;
  if (query.q) {
    const haystack = `${row.id} ${row.originId} ${row.originName} ${row.author} ${row.authors.join(" ")} ${row.bestRepoId} ${row.evidenceRepoId}`;
    if (!matchesText(haystack, query.q)) return false;
  }
  return true;
}

function buildComparators(query: CommonQuery): Record<string, RowComparator<RecipeRow>> {
  const dir = query.dir;
  // The default sort is the canonical leaderboard order, so the rank column
  // and the row order always agree. The corroboration partition does not flip
  // with the direction: an uncorroborated row never leads.
  const byScore: RowComparator<RecipeRow> = (a, b) => {
    const partition = compareVerification(a, b);
    if (partition !== 0) return partition;
    const rest = compareCohort(a, b);
    return dir === "asc" ? -rest : rest;
  };
  const byKl: RowComparator<RecipeRow> = (a, b) => compareNullable(a.kl, b.kl, dir);
  // The count and the rate are different questions. `refusals` is the count
  // of refused tests; `refusalRate` is the share of them.
  const byRefusals: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.refusals, b.refusals, dir);
  const byRefusalRate: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.refusalRate, b.refusalRate, dir);
  const byDownloads: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.downloadsAllTime, b.downloadsAllTime, dir);
  const byRecent: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.downloads30d, b.downloads30d, dir);
  const byParams: RowComparator<RecipeRow> = (a, b) => compareNullable(a.paramsB, b.paramsB, dir);
  const byNewest: RowComparator<RecipeRow> = (a, b) => compareText(a.lastModified, b.lastModified, dir);
  const byName: RowComparator<RecipeRow> = (a, b) => compareText(a.originName, b.originName, dir);
  const byLikes: RowComparator<RecipeRow> = (a, b) => compareNullable(a.likes, b.likes, dir);
  const byBenchmarks: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.benchmarkCount, b.benchmarkCount, dir);
  const byRepos: RowComparator<RecipeRow> = (a, b) => compareNullable(a.repoCount, b.repoCount, dir);
  const byId: RowComparator<RecipeRow> = (a, b) => compareIds(a.id, b.id);

  // Corroboration outranks the requested sort. A fabricated card that claims
  // zero refusals and a zero KL cannot lead any ordering.
  const verified = (compare: RowComparator<RecipeRow>): RowComparator<RecipeRow> =>
    verificationFirst(isVerified, compare);

  return {
    score: verified(byScore),
    kl: verified(byKl),
    refusals: verified(byRefusals),
    refusalRate: verified(byRefusalRate),
    downloads: verified(byDownloads),
    recent: verified(byRecent),
    params: verified(byParams),
    newest: verified(byNewest),
    model: verified(byName),
    likes: verified(byLikes),
    benchmarks: verified(byBenchmarks),
    repos: verified(byRepos),
    id: byId,
  };
}

export async function listRecipes(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const [recipes, meta] = await Promise.all([deps.dataset.recipes(), deps.dataset.meta()]);
  const query = parseQuery(context.query, { sorts: RECIPE_SORTS, defaultSort: DEFAULT_SORT });
  const result = runQuery(recipes, query, matches, buildComparators(query));

  return json(
    {
      updatedAt: meta.generatedAt,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      perPage: result.perPage,
      rows: result.rows,
    },
    { cache: "list" },
  );
}

export async function getRecipe(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const id = context.params.id;
  const [recipes, models, repos, meta] = await Promise.all([
    deps.dataset.recipes(),
    deps.dataset.models(),
    deps.dataset.repos(),
    deps.dataset.meta(),
  ]);

  const recipe = recipes.find((row) => row.id === id);
  if (!recipe) {
    return errorResponse(404, "not_found", `No recipe matches the id "${id}".`);
  }

  const model = models.find((row) => row.id === recipe.originId) ?? null;
  const recipeRepos = repos
    .filter((repo) => repo.recipeId === recipe.id)
    .sort((a, b) => b.downloadsAllTime - a.downloadsAllTime);

  return json(
    {
      updatedAt: meta.generatedAt,
      recipe,
      model,
      repos: recipeRepos,
    },
    { cache: "list" },
  );
}
