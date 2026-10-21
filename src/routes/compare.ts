/**
 * The comparison endpoint.
 *
 * Two models, side by side, with the difference spelled out. The numbers
 * come from the same published rows as every other endpoint, so a
 * comparison never invents a difference.
 */
import { errorResponse, json } from "../lib/http.ts";
import type { ModelRow, RecipeRow, RepoRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

function difference(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((a - b) * 10000) / 10000;
}


/** One side of a comparison. The id may name a model, an ablation or an artifact. */
interface Side {
  kind: "model" | "recipe" | "repo";
  model: ModelRow;
  recipe: RecipeRow | null;
  repo?: RepoRow;
}

/**
 * Resolve an id to a comparable side.
 *
 * A model id names a model. An ablation id names an ablation, and the model it
 * belongs to comes with it. An artifact id names an artifact, and the
 * ablation it carries comes with it. Comparing two artifacts of one model is
 * the question a site asks most often, so it has to work.
 */
function resolve(
  models: ModelRow[],
  recipes: RecipeRow[],
  repos: RepoRow[],
  id: string,
): Side | null {
  const model = models.find((row) => row.id === id);
  if (model) {
    const recipe = model.bestRecipeId
      ? (recipes.find((row) => row.id === model.bestRecipeId) ?? null)
      : null;
    return { kind: "model", model, recipe };
  }

  const recipe = recipes.find((row) => row.id === id);
  if (recipe) {
    const owner = models.find((row) => row.id === recipe.originId);
    if (!owner) return null;
    return { kind: "recipe", model: owner, recipe };
  }

  const repo = repos.find((row) => row.id === id);
  if (repo) {
    const owner = models.find((row) => row.id === repo.originId);
    if (!owner) return null;
    const carried = repo.recipeId
      ? (recipes.find((row) => row.id === repo.recipeId) ?? null)
      : null;
    return { kind: "repo", model: owner, recipe: carried, repo };
  }

  return null;
}

export async function compare(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const a = (context.query.get("a") ?? "").trim();
  const b = (context.query.get("b") ?? "").trim();

  if (!a || !b) {
    return errorResponse(
      400,
      "bad_request",
      "Give two model ids: `a` and `b`, for example `/v1/compare?a=google/gemma-3-12b-it&b=other/model`.",
    );
  }

  const [models, recipes, repos, meta] = await Promise.all([
    deps.dataset.models(),
    deps.dataset.recipes(),
    deps.dataset.repos(),
    deps.dataset.meta(),
  ]);

  const first = resolve(models, recipes, repos, a);
  const second = resolve(models, recipes, repos, b);
  if (!first) {
    return errorResponse(404, "not_found", `Nothing matches the id "${a}".`);
  }
  if (!second) {
    return errorResponse(404, "not_found", `Nothing matches the id "${b}".`);
  }

  const firstBest = first.recipe;
  const secondBest = second.recipe;

  return json(
    {
      updatedAt: meta.generatedAt,
      a: first,
      b: second,
      difference: {
        bestScore: difference(firstBest?.score ?? null, secondBest?.score ?? null),
        kl: difference(firstBest?.kl ?? null, secondBest?.kl ?? null),
        refusalRate: difference(firstBest?.refusalRate ?? null, secondBest?.refusalRate ?? null),
        downloadsAllTime: difference(first.model.downloadsAllTime, second.model.downloadsAllTime),
        downloads30d: difference(first.model.downloads30d, second.model.downloads30d),
        paramsB: difference(first.model.paramsB, second.model.paramsB),
        recipeCount: difference(first.model.recipeCount, second.model.recipeCount),
        repoCount: difference(first.model.repoCount, second.model.repoCount),
      },
      note: "A positive value means a is larger than b. A null means one side published no number.",
    },
    { cache: "list" },
  );
}
