/**
 * The one-shot summary.
 *
 * Everything a homepage needs in a single request: the totals, the leading
 * models, the leading ablations, the leading creators, the leading families
 * and the Heretic versions in use.
 *
 * It is the endpoint a site embeds when it wants the state of the ecosystem
 * without asking for the whole dataset.
 */
import { json } from "../lib/http.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

const TOP = 5;

export async function summary(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const [meta, models, recipes, creators] = await Promise.all([
    deps.dataset.meta(),
    deps.dataset.models(),
    deps.dataset.recipes(),
    deps.dataset.creators(),
  ]);

  const topModels = [...models]
    .filter((model) => model.bestRecipe !== null)
    .sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0) || b.downloadsAllTime - a.downloadsAllTime)
    .slice(0, TOP);

  const topRecipes = [...recipes]
    .filter((recipe) => recipe.ranked)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, TOP);

  const topCreators = [...creators]
    .sort((a, b) => b.totals.allTimeDownloads - a.totals.allTimeDownloads)
    .slice(0, TOP)
    .map((creator) => ({
      username: creator.username,
      modelCount: creator.totals.modelCount,
      allTimeDownloads: creator.totals.allTimeDownloads,
      last30DaysDownloads: creator.totals.last30DaysDownloads,
      bestScore: creator.bestScore,
    }));

  const topFamilies = [...meta.families]
    .sort((a, b) => b.originCount - a.originCount || a.label.localeCompare(b.label))
    .slice(0, TOP);

  return json(
    {
      updatedAt: meta.generatedAt,
      version: meta.version,
      totals: meta.totals,
      counts: meta.counts,
      topModels,
      topRecipes,
      topCreators,
      topFamilies,
      versions: meta.facets.versions.slice(0, TOP),
    },
    { cache: "list" },
  );
}
