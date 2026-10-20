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
  matchesText,
  parseQuery,
  runQuery,
  type CommonQuery,
  type RowComparator,
} from "../lib/query.ts";
import type { ModelRow, RecipeRow, RepoRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const MODEL_SORTS = [
  "score",
  "kl",
  "refusals",
  "downloads",
  "params",
  "newest",
  "model",
] as const;

const DEFAULT_SORT = "score";

function matches(row: ModelRow, query: CommonQuery): boolean {
  if (query.family && row.familySlug !== query.family) return false;
  if (query.size && row.sizeClass !== query.size) return false;
  if (query.minDownloads > 0 && row.downloadsAllTime < query.minDownloads) return false;
  if (query.q) {
    const haystack = `${row.id} ${row.name} ${row.displayName} ${row.owner}`.replace(/_/g, " ");
    if (!matchesText(haystack, query.q)) return false;
  }
  return true;
}

function buildComparators(query: CommonQuery): Record<string, RowComparator<ModelRow>> {
  const dir = query.dir;
  const byScore: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.bestScore, b.bestScore, dir);
  const byKl: RowComparator<ModelRow> = (a, b) => compareNullable(a.bestKl, b.bestKl, dir);
  const byRefusals: RowComparator<ModelRow> = (a, b) =>
    compareNullable(a.bestRefusalRate, b.bestRefusalRate, dir);
  const byDownloads: RowComparator<ModelRow> = (a, b) => compareNullable(a.downloadsAllTime, b.downloadsAllTime, dir);
  const byParams: RowComparator<ModelRow> = (a, b) => compareNullable(a.paramsB, b.paramsB, dir);
  const byNewest: RowComparator<ModelRow> = (a, b) => compareText(a.lastModified, b.lastModified, dir);
  const byName: RowComparator<ModelRow> = (a, b) => compareText(a.displayName, b.displayName, dir);
  const byId: RowComparator<ModelRow> = (a, b) => a.id.localeCompare(b.id);

  return {
    score: byScore,
    kl: byKl,
    refusals: byRefusals,
    downloads: byDownloads,
    params: byParams,
    newest: byNewest,
    model: byName,
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

  const modelRecipes: RecipeRow[] = recipes
    .filter((recipe) => recipe.originId === model.id)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const modelRepos: RepoRow[] = repos.filter((repo) => repo.originId === model.id);

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
