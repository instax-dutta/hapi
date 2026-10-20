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
  if (query.minDownloads > 0 && row.downloadsAllTime < query.minDownloads) return false;
  if (query.q) {
    const haystack = `${row.id} ${row.author} ${row.originId} ${row.family}`;
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
  const byAuthor: RowComparator<RepoRow> = (a, b) => compareText(a.author, b.author, dir);
  const byModel: RowComparator<RepoRow> = (a, b) => compareText(a.id, b.id, dir);
  const byId: RowComparator<RepoRow> = (a, b) => a.id.localeCompare(b.id);

  return {
    downloads: byDownloads,
    likes: byLikes,
    params: byParams,
    newest: byNewest,
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
  const [repos, recipes, meta] = await Promise.all([
    deps.dataset.repos(),
    deps.dataset.recipes(),
    deps.dataset.meta(),
  ]);

  const repo = repos.find((row) => row.id === id);
  if (!repo) {
    return errorResponse(404, "not_found", `No repository matches the id "${id}".`);
  }

  const recipe: RecipeRow | null = repo.recipeId
    ? (recipes.find((row) => row.id === repo.recipeId) ?? null)
    : null;

  return json(
    {
      updatedAt: meta.generatedAt,
      repo,
      recipe,
      url: `https://huggingface.co/${repo.id}`,
    },
    { cache: "list" },
  );
}
