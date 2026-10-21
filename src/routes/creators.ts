/**
 * The creator endpoints.
 *
 * A creator is a Hugging Face account that published an artifact. The list is
 * the creator leaderboard, and a detail returns the creator together with
 * their artifacts and their ablations.
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
import type { CreatorRow, RecipeRow, RepoRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const CREATOR_SORTS = [
  "downloads",
  "models",
  "recipes",
  "score",
  "likes",
  "newest",
  "author",
] as const;

const DEFAULT_SORT = "downloads";

function matches(row: CreatorRow, query: CommonQuery): boolean {
  if (query.minDownloads > 0 && row.totals.allTimeDownloads < query.minDownloads) return false;
  if (query.minLikes > 0 && row.likes < query.minLikes) return false;
  if (query.minScore > 0 && (row.bestScore ?? 0) < query.minScore) return false;
  if (query.q && !matchesText(row.username, query.q)) return false;
  return true;
}

function buildComparators(query: CommonQuery): Record<string, RowComparator<CreatorRow>> {
  const dir = query.dir;
  const byDownloads: RowComparator<CreatorRow> = (a, b) =>
    compareNullable(a.totals.allTimeDownloads, b.totals.allTimeDownloads, dir);
  const byModels: RowComparator<CreatorRow> = (a, b) =>
    compareNullable(a.totals.modelCount, b.totals.modelCount, dir);
  const byRecipes: RowComparator<CreatorRow> = (a, b) =>
    compareNullable(a.recipeCount, b.recipeCount, dir);
  const byScore: RowComparator<CreatorRow> = (a, b) => compareNullable(a.bestScore, b.bestScore, dir);
  const byLikes: RowComparator<CreatorRow> = (a, b) => compareNullable(a.likes, b.likes, dir);
  const byNewest: RowComparator<CreatorRow> = (a, b) =>
    compareText(a.lastModified, b.lastModified, dir);
  const byName: RowComparator<CreatorRow> = (a, b) => compareText(a.username, b.username, dir);
  const byId: RowComparator<CreatorRow> = (a, b) => a.username.localeCompare(b.username);

  return {
    downloads: byDownloads,
    models: byModels,
    recipes: byRecipes,
    score: byScore,
    likes: byLikes,
    newest: byNewest,
    author: byName,
    id: byId,
  };
}

export async function listCreators(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const [creators, meta] = await Promise.all([deps.dataset.creators(), deps.dataset.meta()]);
  const query = parseQuery(context.query, { sorts: CREATOR_SORTS, defaultSort: DEFAULT_SORT });
  const result = runQuery(creators, query, matches, buildComparators(query));

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

export async function getCreator(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const username = context.params.username;
  const [creators, repos, recipes, meta] = await Promise.all([
    deps.dataset.creators(),
    deps.dataset.repos(),
    deps.dataset.recipes(),
    deps.dataset.meta(),
  ]);

  // Hugging Face usernames are case-insensitive for lookup, so a client that
  // typed `Coder3101` must not get a 404 for `coder3101`.
  const wanted = username.toLowerCase();
  const creator = creators.find((row) => row.username.toLowerCase() === wanted);
  if (!creator) {
    return errorResponse(404, "not_found", `No creator matches the username "${username}".`);
  }

  const creatorRepos: RepoRow[] = repos
    .filter((repo) => repo.author.toLowerCase() === wanted)
    .sort((a, b) => b.downloadsAllTime - a.downloadsAllTime);
  const creatorRecipes: RecipeRow[] = recipes
    .filter((recipe) => recipe.author.toLowerCase() === wanted)
    .sort((a, b) => b.score - a.score);

  return json(
    {
      updatedAt: meta.generatedAt,
      creator,
      repos: creatorRepos,
      recipes: creatorRecipes,
    },
    { cache: "list" },
  );
}
