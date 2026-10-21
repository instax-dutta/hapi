/**
 * The comparison endpoint.
 *
 * Two models, side by side, with the difference spelled out. The numbers
 * come from the same published rows as every other endpoint, so a
 * comparison never invents a difference.
 */
import { errorResponse, json } from "../lib/http.ts";
import type { ModelRow, RecipeRow } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

function difference(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((a - b) * 10000) / 10000;
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

  const [models, recipes, meta] = await Promise.all([
    deps.dataset.models(),
    deps.dataset.recipes(),
    deps.dataset.meta(),
  ]);

  const first = models.find((row) => row.id === a);
  const second = models.find((row) => row.id === b);
  if (!first) {
    return errorResponse(404, "not_found", `No model matches the id "${a}".`);
  }
  if (!second) {
    return errorResponse(404, "not_found", `No model matches the id "${b}".`);
  }

  const bestOf = (model: ModelRow): RecipeRow | null =>
    model.bestRecipeId
      ? (recipes.find((recipe) => recipe.id === model.bestRecipeId) ?? null)
      : null;

  const firstBest = bestOf(first);
  const secondBest = bestOf(second);

  return json(
    {
      updatedAt: meta.generatedAt,
      a: { model: first, recipe: firstBest },
      b: { model: second, recipe: secondBest },
      difference: {
        bestScore: difference(firstBest?.score ?? null, secondBest?.score ?? null),
        kl: difference(firstBest?.kl ?? null, secondBest?.kl ?? null),
        refusalRate: difference(firstBest?.refusalRate ?? null, secondBest?.refusalRate ?? null),
        downloadsAllTime: difference(first.downloadsAllTime, second.downloadsAllTime),
        downloads30d: difference(first.downloads30d, second.downloads30d),
        paramsB: difference(first.paramsB, second.paramsB),
        recipeCount: difference(first.recipeCount, second.recipeCount),
        repoCount: difference(first.repoCount, second.repoCount),
      },
      note: "A positive value means a is larger than b. A null means one side published no number.",
    },
    { cache: "list" },
  );
}
