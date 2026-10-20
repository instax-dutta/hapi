/**
 * The conversion from a directory snapshot into the published API rows.
 *
 * The snapshot is `heretico`'s shape. The published rows are the API's shape.
 * Keeping the conversion in one place means the pipeline and the sample
 * builder cannot drift apart.
 */
import { createHash } from "node:crypto";
import type { Snapshot } from "../../src/core/types.ts";
import type { DatasetMeta, ModelRow, RecipeRow, RepoRow } from "../../src/lib/types.ts";

export interface ApiRows {
  meta: DatasetMeta;
  models: ModelRow[];
  recipes: RecipeRow[];
  repos: RepoRow[];
}

/**
 * The API rows for a snapshot.
 *
 * The recipe's evidence snippet comes from the artifact it cites as evidence.
 * That artifact published the numbers, so its card carries the snippet.
 */
export function apiRowsFromSnapshot(snapshot: Snapshot): ApiRows {
  const originById = new Map(snapshot.origins.map((origin) => [origin.id, origin]));
  const repoById = new Map(snapshot.repos.map((repo) => [repo.id, repo]));

  const models: ModelRow[] = snapshot.origins.map((origin) => ({
    id: origin.id,
    owner: origin.owner,
    name: origin.name,
    displayName: origin.displayName,
    family: origin.family,
    familySlug: origin.familySlug,
    paramsB: origin.paramsB,
    paramsActiveB: origin.paramsActiveB,
    sizeClass: origin.sizeClass,
    moe: origin.moe,
    recipeCount: origin.recipeCount,
    rankedCount: origin.rankedCount,
    bestRecipeId: origin.bestRecipeId,
    bestScore: origin.bestScore,
    bestKl: origin.bestKl,
    bestRefusalRate: origin.bestRefusalRate,
    verifiedRepoCount: origin.verifiedRepoCount,
    downloadsAllTime: origin.downloadsAllTime,
    downloads30d: origin.downloads30d,
    lastModified: origin.lastModified,
  }));

  const recipes: RecipeRow[] = snapshot.recipes.map((recipe) => {
    const origin = originById.get(recipe.originId);
    const evidence = repoById.get(recipe.evidenceRepoId);
    return {
      id: recipe.id,
      originId: recipe.originId,
      originName: origin?.displayName ?? recipe.originId,
      family: origin?.family ?? "Other",
      familySlug: origin?.familySlug ?? "other",
      sizeClass: origin?.sizeClass ?? "unknown",
      author: recipe.author,
      kind: recipe.kind,
      kl: recipe.kl,
      refusals: recipe.refusals,
      refusalTotal: recipe.refusalTotal,
      refusalRate: recipe.refusalRate,
      score: recipe.score,
      // A recipe with no published pair is served, and it is marked. It is
      // never given a score and never hidden.
      ranked: recipe.score > 0,
      pareto: recipe.pareto,
      bestPick: recipe.bestPick,
      implausible: recipe.implausible,
      confidence: recipe.confidence,
      verification: recipe.verification,
      hereticVersion: recipe.hereticVersion,
      formats: recipe.formats,
      paramsB: recipe.paramsB,
      downloadsAllTime: recipe.downloadsAllTime,
      downloads30d: recipe.downloads30d,
      likes: recipe.likes,
      lastModified: recipe.lastModified,
      repoCount: recipe.repoIds.length,
      bestRepoId: recipe.bestRepoId,
      evidenceRepoId: recipe.evidenceRepoId,
      benchmarks: recipe.benchmarks,
      evidence: evidence?.metrics.evidence ?? null,
    };
  });

  const repos: RepoRow[] = snapshot.repos.map((repo) => ({
    id: repo.id,
    author: repo.author,
    originId: repo.originId ?? "",
    recipeId: repo.recipeId,
    kind: repo.kind,
    downloads30d: repo.downloads30d,
    downloadsAllTime: repo.downloadsAllTime,
    likes: repo.likes,
    paramsB: repo.paramsB,
    sizeClass: repo.sizeClass,
    family: repo.family,
    familySlug: repo.familySlug,
    formats: repo.formats,
    quant: repo.quant,
    license: repo.license,
    pipelineTag: repo.pipelineTag,
    libraryName: repo.libraryName,
    gated: repo.gated,
    createdAt: repo.createdAt,
    lastModified: repo.lastModified,
    hereticVersion: repo.hereticVersion,
    verified: repo.verified,
    classificationEvidence: repo.classificationEvidence,
    metrics: {
      kl: repo.metrics.kl,
      refusals: repo.metrics.refusals,
      refusalTotal: repo.metrics.refusalTotal,
      confidence: repo.metrics.confidence,
      sourceRepoId: repo.metrics.sourceRepoId,
      evidence: repo.metrics.evidence,
    },
  }));

  // The version is a content hash of the published rows. It changes when the
  // data changes and not when the build is merely re-run.
  const version = createHash("sha256")
    .update(JSON.stringify({ models, recipes, repos }))
    .digest("hex")
    .slice(0, 12);

  const meta: DatasetMeta = {
    version,
    generatedAt: snapshot.updatedAt,
    generator: "hapi",
    source: snapshot.source,
    totals: snapshot.totals,
    families: snapshot.families,
    counts: {
      models: models.length,
      recipes: recipes.length,
      repos: repos.length,
    },
  };

  return { meta, models, recipes, repos };
}
