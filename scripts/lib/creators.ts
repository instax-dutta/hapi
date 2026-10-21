/**
 * The creator rows.
 *
 * A creator's numbers come from the discovery, not from the published
 * artifacts. The live counter at `heretic.sdad.pro` counts every model a
 * creator published that carries the `heretic` tag or has `heretic` in its
 * name. The directory publishes only the artifacts it could place under a
 * canonical model, which for a prolific re-uploader is a small fraction of the
 * traffic they actually generated.
 *
 * The two scopes are both published: the discovery totals are the ecosystem
 * reach, the classified extras are what the directory can say about the
 * creator's work.
 */
import type { CreatorRow, RecipeRow, RepoRow } from "../../src/lib/types.ts";
import { estimateDownloadsPerSecond, LIVE_RATE_WINDOW_DAYS } from "../../src/core/live.ts";
import { compareCanonical } from "../../src/core/scoring.ts";

/** One model as the discovery found it. */
export interface DiscoveredModel {
  id: string;
  author: string;
  downloads30d: number;
  downloadsAllTime: number;
  likes: number;
}

export function buildCreators(
  discovery: DiscoveredModel[],
  recipes: RecipeRow[],
  repos: RepoRow[],
  updatedAt: string,
): CreatorRow[] {
  const byAuthor = new Map<string, DiscoveredModel[]>();
  for (const model of discovery) {
    if (!model.author) continue;
    const list = byAuthor.get(model.author) ?? [];
    list.push(model);
    byAuthor.set(model.author, list);
  }

  // The classified work of each creator: the ablations they published and the
  // artifacts they published.
  const recipesByAuthor = new Map<string, RecipeRow[]>();
  for (const recipe of recipes) {
    for (const author of recipe.authors) {
      const list = recipesByAuthor.get(author) ?? [];
      list.push(recipe);
      recipesByAuthor.set(author, list);
    }
  }
  const reposByAuthor = new Map<string, RepoRow[]>();
  for (const repo of repos) {
    const list = reposByAuthor.get(repo.author) ?? [];
    list.push(repo);
    reposByAuthor.set(repo.author, list);
  }

  const creators: CreatorRow[] = [];
  for (const [username, models] of byAuthor) {
    const totals = {
      modelCount: models.length,
      allTimeDownloads: models.reduce((sum, model) => sum + model.downloadsAllTime, 0),
      last30DaysDownloads: models.reduce((sum, model) => sum + model.downloads30d, 0),
    };

    const authorRecipes = (recipesByAuthor.get(username) ?? []).sort(compareCanonical);
    const authorRepos = reposByAuthor.get(username) ?? [];
    const best = authorRecipes[0] ?? null;

    creators.push({
      scope: "user",
      username,
      updatedAt,
      totals,
      rate: {
        downloadsPerSecond: estimateDownloadsPerSecond(totals.last30DaysDownloads),
        windowDays: LIVE_RATE_WINDOW_DAYS,
        basis: "derived",
      },
      source: "Hugging Face Hub API · heretic tag + name index",
      recipeCount: authorRecipes.length,
      originCount: new Set(authorRepos.map((repo) => repo.originId)).size,
      likes: models.reduce((sum, model) => sum + model.likes, 0),
      bestScore: best?.score ?? null,
      bestKl: best?.kl ?? null,
      bestRefusalRate: best?.refusalRate ?? null,
      verifiedCount: authorRecipes.filter(
        (recipe) => recipe.verification === "verified" || recipe.verification === "publisher",
      ).length,
      lastModified: models
        .map((model) => model.lastModified)
        .sort()
        .reverse()[0] ?? updatedAt,
      models: models
        .slice()
        .sort((a, b) => b.downloadsAllTime - a.downloadsAllTime)
        .map((model) => ({
          id: model.id,
          url: `https://huggingface.co/${model.id}`,
          downloads: model.downloads30d,
          downloadsAllTime: model.downloadsAllTime,
          likes: model.likes,
        })),
    });
  }

  creators.sort((a, b) => b.totals.allTimeDownloads - a.totals.allTimeDownloads);
  return creators;
}
