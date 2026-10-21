/**
 * The artifact endpoints.
 *
 * A repo is one published artifact. It is never ranked: a quantization of one
 * ablation is not a second result. The listing exists so a client can find
 * the exact artifact to download.
 */
import { errorResponse, json } from "../lib/http.ts";
import {
  compareNullable,
  compareText,
  isUpdatedAfter,
  matchesText,
  parseQuery,
  runQuery,
  type CommonQuery,
  type RowComparator,
} from "../lib/query.ts";
import type { RecipeRow, RepoRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const REPO_SORTS = [
  "downloads",
  "likes",
  "params",
  "newest",
  "created",
  "author",
  "model",
] as const;

const DEFAULT_SORT = "downloads";

function matches(row: RepoRow, query: CommonQuery): boolean {
  if (query.family && row.familySlug !== query.family) return false;
  if (query.size && row.sizeClass !== query.size) return false;
  if (query.format && !row.formats.includes(query.format)) return false;
  if (query.kind && row.kind !== query.kind) return false;
  if (query.author && row.author !== query.author) return false;
  if (query.origin && row.originId !== query.origin) return false;
  if (query.license && (row.license ?? "").toLowerCase() !== query.license) return false;
  if (query.quant && (row.quant ?? "").toUpperCase() !== query.quant) return false;
  if (query.minDownloads > 0 && row.downloadsAllTime < query.minDownloads) return false;
  if (query.minLikes > 0 && row.likes < query.minLikes) return false;
  if (query.minParams > 0 && (row.paramsB ?? 0) < query.minParams) return false;
  if (query.maxParams > 0 && (row.paramsB ?? Infinity) > query.maxParams) return false;
  if (query.bench && row.benchmarkCount === 0) return false;
  if (query.direct && !row.isDirectConversion) return false;
  if (!isUpdatedAfter(row.lastModified, query.updatedAfter)) return false;
  if (query.q) {
    const haystack = `${row.id} ${row.author} ${row.originId} ${row.family} ${row.tags.join(" ")} ${row.baseModels.join(" ")}`;
    if (!matchesText(haystack, query.q)) return false;
  }
  return true;
}

function buildComparators(query: CommonQuery): Record<string, RowComparator<RepoRow>> {
  const dir = query.dir;
  const byDownloads: RowComparator<RepoRow> = (a, b) =>
    compareNullable(a.downloadsAllTime, b.downloadsAllTime, dir);
  const byLikes: RowComparator<RepoRow> = (a, b) => compareNullable(a.likes, b.likes, dir);
  const byParams: RowComparator<RepoRow> = (a, b) => compareNullable(a.paramsB, b.paramsB, dir);
  const byNewest: RowComparator<RepoRow> = (a, b) => compareText(a.lastModified, b.lastModified, dir);
  const byCreated: RowComparator<RepoRow> = (a, b) => compareText(a.createdAt, b.createdAt, dir);
  const byAuthor: RowComparator<RepoRow> = (a, b) => compareText(a.author, b.author, dir);
  const byModel: RowComparator<RepoRow> = (a, b) => compareText(a.id, b.id, dir);
  const byId: RowComparator<RepoRow> = (a, b) => a.id.localeCompare(b.id);

  return {
    downloads: byDownloads,
    likes: byLikes,
    params: byParams,
    newest: byNewest,
    created: byCreated,
    author: byAuthor,
    model: byModel,
    id: byId,
  };
}

export async function listRepos(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const [repos, meta] = await Promise.all([deps.dataset.repos(), deps.dataset.meta()]);
  const query = parseQuery(context.query, { sorts: REPO_SORTS, defaultSort: DEFAULT_SORT });
  const result = runQuery(repos, query, matches, buildComparators(query));

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

export async function getRepo(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const id = context.params.id;
  const [repos, recipes, models, meta] = await Promise.all([
    deps.dataset.repos(),
    deps.dataset.recipes(),
    deps.dataset.models(),
    deps.dataset.meta(),
  ]);

  const repo = repos.find((row) => row.id === id);
  if (!repo) {
    return errorResponse(404, "not_found", `No repository matches the id "${id}".`);
  }

  const recipe: RecipeRow | null = repo.recipeId
    ? (recipes.find((row) => row.id === repo.recipeId) ?? null)
    : null;
  const model = models.find((row) => row.id === repo.originId) ?? null;

  return json(
    {
      updatedAt: meta.generatedAt,
      repo,
      recipe,
      model,
      url: `https://huggingface.co/${repo.id}`,
    },
    { cache: "list" },
  );
}
