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
  matchesText,
  parseQuery,
  runQuery,
  verificationFirst,
  type CommonQuery,
  type RowComparator,
} from "../lib/query.ts";
import type { RecipeRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const RECIPE_SORTS = [
  "score",
  "kl",
  "refusals",
  "downloads",
  "params",
  "newest",
  "model",
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
  if (query.minDownloads > 0 && row.downloadsAllTime < query.minDownloads) return false;
  if (query.bench && row.benchmarks.length === 0) return false;
  if (query.q) {
    const haystack = `${row.id} ${row.originId} ${row.originName} ${row.author} ${row.bestRepoId} ${row.evidenceRepoId}`;
    if (!matchesText(haystack, query.q)) return false;
  }
  return true;
}

function buildComparators(query: CommonQuery): Record<string, RowComparator<RecipeRow>> {
  const dir = query.dir;
  const byScore: RowComparator<RecipeRow> = (a, b) => compareNullable(a.score, b.score, dir);
  const byKl: RowComparator<RecipeRow> = (a, b) => compareNullable(a.kl, b.kl, dir);
  const byRefusals: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.refusalRate, b.refusalRate, dir);
  const byDownloads: RowComparator<RecipeRow> = (a, b) =>
    compareNullable(a.downloadsAllTime, b.downloadsAllTime, dir);
  const byParams: RowComparator<RecipeRow> = (a, b) => compareNullable(a.paramsB, b.paramsB, dir);
  const byNewest: RowComparator<RecipeRow> = (a, b) => compareText(a.lastModified, b.lastModified, dir);
  const byName: RowComparator<RecipeRow> = (a, b) => compareText(a.originName, b.originName, dir);
  const byId: RowComparator<RecipeRow> = (a, b) => a.id.localeCompare(b.id);

  // Corroboration outranks the requested sort. A fabricated card that claims
  // zero refusals and a zero KL cannot lead any ordering.
  const verified = (compare: RowComparator<RecipeRow>): RowComparator<RecipeRow> =>
    verificationFirst(isVerified, compare);

  return {
    score: verified(byScore),
    kl: verified(byKl),
    refusals: verified(byRefusals),
    downloads: verified(byDownloads),
    params: verified(byParams),
    newest: verified(byNewest),
    model: verified(byName),
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
  const recipeRepos = repos.filter((repo) => repo.recipeId === recipe.id);

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
