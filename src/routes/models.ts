/**
 * The model endpoints.
 *
 * A model is an Origin: one canonical upstream model. The list is the set of
 * origins the directory resolved, and a detail returns the origin together
 * with its recipes and its artifacts, so a client never needs a second round
 * trip.
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
import { compareCanonicalModel, compareIds } from "../core/scoring.ts";
import type { ModelRow, RecipeRow, RepoRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const MODEL_SORTS = [
  "score",
  "kl",
  "refusals",
  "refusalRate",
  "downloads",
  "recent",
  "params",
  "newest",
  "model",
  "recipes",
  "repos",
  "likes",
] as const;

const DEFAULT_SORT = "score";

function matches(row: ModelRow, query: CommonQuery): boolean {
  if (query.family && row.familySlug !== query.family) return false;
  if (query.size && row.sizeClass !== query.size) return false;
  if (query.format && !row.formats.includes(query.format)) return false;
  if (query.minDownloads > 0 && row.downloadsAllTime < query.minDownloads) return false;
  if (query.minLikes > 0 && row.likes < query.minLikes) return false;
  if (query.minScore > 0 && (row.bestScore ?? 0) < query.minScore) return false;
  if (query.maxKl > 0 && (row.bestKl ?? Infinity) > query.maxKl) return false;
  if (query.minParams > 0 && (row.paramsB ?? 0) < query.minParams) return false;
  if (query.implausible === "0" && row.bestRecipe?.implausible) return false;
  if (query.implausible === "1" && !row.bestRecipe?.implausible) return false;
  if (query.maxParams > 0 && (row.paramsB ?? Infinity) > query.maxParams) return false;
  if (!isUpdatedAfter(row.lastModified, query.updatedAfterTime)) return false;
  if (query.q) {
    const haystack = `${row.id} ${row.name} ${row.displayName} ${row.owner} ${row.authors.join(" ")}`;
    if (!matchesText(haystack, query.q)) return false;
  }
  return true;
}

function buildComparators(query: CommonQuery): Record<string, RowComparator<ModelRow>> {
  const dir = query.dir;
  // The canonical order of models, so the rank column and the row order agree.
  const byScore: RowComparator<ModelRow> = (a, b) => {
    const rest = compareCanonicalModel(a, b);
    return dir === "asc" ? -rest : rest;
  };
  const byKl: RowComparator<ModelRow> = (a, b) => compareNullable(a.bestKl, b.bestKl, dir);
  const byRefusals: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.bestRefusals, b.bestRefusals, dir);
  const byRefusalRate: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.bestRefusalRate, b.bestRefusalRate, dir);
  const byDownloads: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.downloadsAllTime, b.downloadsAllTime, dir);
  const byRecent: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.downloads30d, b.downloads30d, dir);
  const byParams: RowComparator<ModelRow> = (a, b) => compareNullable(a.paramsB, b.paramsB, dir);
  const byNewest: RowComparator<ModelRow> = (a, b) => compareText(a.lastModified, b.lastModified, dir);
  const byName: RowComparator<ModelRow> = (a, b) => compareText(a.displayName, b.displayName, dir);
  const byRecipes: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.recipeCount, b.recipeCount, dir);
  const byRepos: RowComparator<ModelRow> = (a, b) => compareNullable(a.repoCount, b.repoCount, dir);
  const byLikes: RowComparator<ModelRow> = (a, b) => compareNullable(a.likes, b.likes, dir);
  const byId: RowComparator<ModelRow> = (a, b) => compareIds(a.id, b.id);

  return {
    score: byScore,
    kl: byKl,
    refusals: byRefusals,
    refusalRate: byRefusalRate,
    downloads: byDownloads,
    recent: byRecent,
    params: byParams,
    newest: byNewest,
    model: byName,
    recipes: byRecipes,
    repos: byRepos,
    likes: byLikes,
    id: byId,
  };
}

export async function listModels(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const [models, meta] = await Promise.all([deps.dataset.models(), deps.dataset.meta()]);
  const query = parseQuery(context.query, { sorts: MODEL_SORTS, defaultSort: DEFAULT_SORT });
  const result = runQuery(models, query, matches, buildComparators(query));

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

export async function getModel(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const id = context.params.id;
  const [models, recipes, repos, meta] = await Promise.all([
    deps.dataset.models(),
    deps.dataset.recipes(),
    deps.dataset.repos(),
    deps.dataset.meta(),
  ]);

  const model = models.find((row) => row.id === id);
  if (!model) {
    return errorResponse(404, "not_found", `No model matches the id "${id}".`);
  }

  // Corroboration outranks score here too. A model page must not lead with
  // an uncorroborated card.
  const modelRecipes: RecipeRow[] = recipes
    .filter((recipe) => recipe.originId === model.id)
    .sort(
      verificationFirst(
        (recipe: RecipeRow) =>
          recipe.verification === "verified" || recipe.verification === "publisher",
        (a, b) => b.score - a.score || a.kl - b.kl || compareIds(a.id, b.id),
      ),
    );
  const modelRepos: RepoRow[] = repos
    .filter((repo) => repo.originId === model.id)
    .sort((a, b) => b.downloadsAllTime - a.downloadsAllTime);

  return json(
    {
      updatedAt: meta.generatedAt,
      model,
      recipes: modelRecipes,
      repos: modelRepos,
    },
    { cache: "list" },
  );
}
