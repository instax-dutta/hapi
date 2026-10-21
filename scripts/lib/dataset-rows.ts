/**
 * The conversion from a directory snapshot into the published API rows.
 *
 * The snapshot is `heretico`'s shape. The published rows are the API's shape.
 * Keeping the conversion in one place means the pipeline and the sample
 * builder cannot drift apart.
 */
import { createHash } from "node:crypto";
import type { Snapshot } from "../../src/core/types.ts";
import { estimateDownloadsPerSecond, LIVE_RATE_WINDOW_DAYS } from "../../src/core/live.ts";
import {
  compareCanonical,
  compareCanonicalModel,
  compareIds,
} from "../../src/core/scoring.ts";
import type {
  BestRecipeSummary,
  DatasetFacets,
  DatasetMeta,
  FacetCount,
  ModelRow,
  RecipeRow,
  RepoRow,
} from "../../src/lib/types.ts";

export interface ApiRows {
  meta: DatasetMeta;
  models: ModelRow[];
  recipes: RecipeRow[];
  repos: RepoRow[];
}

/** The Hub metadata the snapshot does not carry. */
export interface RawExtras {
  /** The Hub's own tags for a repository. */
  tags?: Record<string, string[]>;
  /** The total parameter count the Hub reports, in parameters. */
  safetensorsTotal?: Record<string, number>;
}

const RATE_WINDOW_DAYS = LIVE_RATE_WINDOW_DAYS;

function perDay(downloads30d: number): number {
  return Math.round((downloads30d / RATE_WINDOW_DAYS) * 1000) / 1000;
}

function facet(rows: Array<{ value: string; downloadsAllTime: number }>): FacetCount[] {
  const counts = new Map<string, { count: number; downloadsAllTime: number }>();
  for (const row of rows) {
    if (!row.value) continue;
    const entry = counts.get(row.value) ?? { count: 0, downloadsAllTime: 0 };
    entry.count += 1;
    entry.downloadsAllTime += row.downloadsAllTime;
    counts.set(row.value, entry);
  }
  return [...counts.entries()]
    .map(([value, entry]) => ({ value, ...entry }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * The API rows for a snapshot.
 *
 * The recipe's evidence snippet comes from the artifact it cites as evidence.
 * That artifact published the numbers, so its card carries the snippet.
 */

/**
 * The canonical leaderboard order.
 *
 * Corroboration first, then the score, then the cheaper ablation, then the
 * id. The rank column and the default sort have to agree, so both use this.
 * A leaderboard whose rows read 17, 19, 18 is right about every number in it
 * and still looks broken.
 */
export function compareRecipes(a: RecipeRow, b: RecipeRow): number {
  return compareCanonical(a, b);
}

/**
 * Give every ablation its position.
 *
 * Three positions, three questions:
 *   rank        - among the ranked ablations, the leaderboard
 *   originRank  - among the ablations of the same model, the model page
 *   familyRank  - among the ablations of the same family, the family page
 */
export function assignRanks(recipes: RecipeRow[]): void {
  for (const recipe of recipes) {
    recipe.rank = null;
    recipe.originRank = null;
    recipe.familyRank = null;
  }
  const ranked = recipes.filter((recipe) => recipe.ranked).sort(compareRecipes);
  ranked.forEach((recipe, index) => {
    recipe.rank = index + 1;
  });

  const byOrigin = new Map<string, RecipeRow[]>();
  const byFamily = new Map<string, RecipeRow[]>();
  for (const recipe of ranked) {
    const origin = byOrigin.get(recipe.originId) ?? [];
    origin.push(recipe);
    byOrigin.set(recipe.originId, origin);
    const family = byFamily.get(recipe.familySlug) ?? [];
    family.push(recipe);
    byFamily.set(recipe.familySlug, family);
  }
  for (const cohort of byOrigin.values()) {
    cohort.forEach((recipe, index) => {
      recipe.originRank = index + 1;
    });
  }
  for (const cohort of byFamily.values()) {
    cohort.forEach((recipe, index) => {
      recipe.familyRank = index + 1;
    });
  }
}

/**
 * The API rows for a snapshot.
 *
 * The recipe's evidence snippet comes from the artifact it cites as evidence.
 * That artifact published the numbers, so its card carries the snippet.
 */
export function apiRowsFromSnapshot(snapshot: Snapshot, extras: RawExtras = {}): ApiRows {
  const originById = new Map(snapshot.origins.map((origin) => [origin.id, origin]));
  const repoById = new Map(snapshot.repos.map((repo) => [repo.id, repo]));

  const repos: RepoRow[] = snapshot.repos.map((repo) => ({
    id: repo.id,
    url: `https://huggingface.co/${repo.id}`,
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
    isDirectConversion: repo.kind === "heretic",
    classificationEvidence: repo.classificationEvidence,
    // The base chain. The declared base models are the same list, so only one
    // of them is published.
    parentIds: repo.parentIds,
    tags: extras.tags?.[repo.id] ?? [],
    safetensorsTotal: extras.safetensorsTotal?.[repo.id] ?? null,
    benchmarkCount: repo.benchmarks.length,
    kl: repo.metrics.kl,
    refusals: repo.metrics.refusals,
    refusalTotal: repo.metrics.refusalTotal,
    confidence: repo.metrics.confidence,
    evidence: repo.metrics.evidence,
    inheritedFrom: repo.metrics.sourceRepoId,
  }));

  const recipes: RecipeRow[] = snapshot.recipes.map((recipe) => {
    const origin = originById.get(recipe.originId);
    const evidence = repoById.get(recipe.evidenceRepoId);
    const members = recipe.repoIds
      .map((id) => repoById.get(id))
      .filter((repo): repo is NonNullable<typeof repo> => Boolean(repo));

    const originalKl = evidence?.metrics.originalKl ?? null;
    const originalRefusals = evidence?.metrics.originalRefusals ?? null;
    const originalRefusalTotal = evidence?.metrics.originalRefusalTotal ?? null;
    const baseRefusalRate =
      originalRefusals !== null && originalRefusalTotal !== null && originalRefusalTotal > 0
        ? Math.round((originalRefusals / originalRefusalTotal) * 10000) / 10000
        : null;

    return {
      id: recipe.id,
      url: `https://huggingface.co/${recipe.bestRepoId}`,
      rank: null,
      originRank: null,
      familyRank: null,
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
      downloadsPerDay: perDay(recipe.downloads30d),
      likes: recipe.likes,
      lastModified: recipe.lastModified,
      createdAt: members.map((member) => member.createdAt).sort()[0] ?? recipe.lastModified,
      repoCount: recipe.repoIds.length,
      repoIds: recipe.repoIds,
      bestRepoId: recipe.bestRepoId,
      evidenceRepoId: recipe.evidenceRepoId,
      benchmarks: recipe.benchmarks,
      benchmarkCount: recipe.benchmarks.length,
      evidence: evidence?.metrics.evidence ?? null,
      originalKl,
      originalRefusals,
      originalRefusalTotal,
      baseRefusalRate,
      refusalReduction:
        baseRefusalRate === null ? null : Math.round((baseRefusalRate - recipe.refusalRate) * 10000) / 10000,
      licenses: [
        ...new Set(members.map((member) => member.license).filter((value): value is string => Boolean(value))),
      ].sort(compareIds),
      quantizations: [
        ...new Set(members.map((member) => member.quant).filter((value): value is string => Boolean(value))),
      ].sort(compareIds),
      authors: [...new Set(members.map((member) => member.author))].sort(compareIds),
    };
  });

  assignRanks(recipes);
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const models: ModelRow[] = snapshot.origins.map((origin) => {
    const cohort = recipes.filter((recipe) => recipe.originId === origin.id);
    const members = repos.filter((repo) => repo.originId === origin.id);
    const best = cohort.find((recipe) => recipe.bestPick) ?? null;
    const summary: BestRecipeSummary | null = best
      ? {
          id: best.id,
          author: best.author,
          implausible: best.implausible,
          score: best.score,
          kl: best.kl,
          refusals: best.refusals,
          refusalTotal: best.refusalTotal,
          refusalRate: best.refusalRate,
          verification: best.verification,
          confidence: best.confidence,
          hereticVersion: best.hereticVersion,
          downloadsAllTime: best.downloadsAllTime,
          lastModified: best.lastModified,
          originalKl: best.originalKl,
          originalRefusals: best.originalRefusals,
          originalRefusalTotal: best.originalRefusalTotal,
        }
      : null;

    return {
      id: origin.id,
      url: `https://huggingface.co/${origin.id}`,
      rank: null,
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
      repoCount: members.length,
      bestRecipeId: origin.bestRecipeId,
      bestScore: origin.bestScore,
      bestKl: origin.bestKl,
      bestRefusalRate: origin.bestRefusalRate,
      bestRefusals: best?.refusals ?? null,
      bestRecipe: summary,
      verifiedRepoCount: origin.verifiedRepoCount,
      downloadsAllTime: origin.downloadsAllTime,
      downloads30d: origin.downloads30d,
      downloadsPerDay: perDay(origin.downloads30d),
      likes: members.reduce((sum, member) => sum + member.likes, 0),
      lastModified: origin.lastModified,
      createdAt: members.map((member) => member.createdAt).sort()[0] ?? origin.lastModified,
      formats: [...new Set(members.flatMap((member) => member.formats))].sort(),
      licenses: [...new Set(members.map((member) => member.license).filter(Boolean))].sort() as string[],
      hereticVersions: [
        ...new Set(members.map((member) => member.hereticVersion).filter(Boolean)),
      ].sort() as string[],
      authors: [...new Set(members.map((member) => member.author))].sort(compareIds),
    };
  });

  assignModelRanks(models);

  const facets = buildFacets(recipes, repos, models);

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
      // The creator count is added by the caller, which knows the discovery.
      creators: 0,
    },
    facets,
  };

  return { meta, models, recipes, repos };
}

/**
 * Give every model its position.
 *
 * The position is among the models that lead with a corroborated ablation. A
 * model whose conversions are all uncorroborated has no place on the board.
 */
export function assignModelRanks(models: ModelRow[]): void {
  // The rank is cleared first. A model that leads with no corroborated
  // ablation has no place on the board, and a stale rank from an earlier pass
  // would leave it there.
  for (const model of models) model.rank = null;
  const ranked = models
    .filter((model) => model.bestRecipe !== null)
    .sort((a, b) => compareCanonicalModel(a, b));
  ranked.forEach((model, index) => {
    model.rank = index + 1;
  });
}

export function buildFacets(
  recipes: RecipeRow[],
  repos: RepoRow[],
  models: ModelRow[],
): DatasetFacets {
  return {
    // Every facet counts artifacts, so the counts line up with what a filter
    // over the artifacts returns.
    versions: facet(
      repos
        .filter((repo) => Boolean(repo.hereticVersion))
        .map((repo) => ({
          value: repo.hereticVersion as string,
          downloadsAllTime: repo.downloadsAllTime,
        })),
    ),
    formats: facet(
      recipes.flatMap((recipe) =>
        recipe.formats.map((format) => ({
          value: format,
          downloadsAllTime: recipe.downloadsAllTime,
        })),
      ),
    ),
    licenses: facet(
      repos
        .filter((repo) => Boolean(repo.license))
        .map((repo) => ({ value: repo.license as string, downloadsAllTime: repo.downloadsAllTime })),
    ),
    tags: facet(
      repos.flatMap((repo) =>
        repo.tags.map((tag) => ({ value: tag, downloadsAllTime: repo.downloadsAllTime })),
      ),
    ),
    kinds: facet(
      repos.map((repo) => ({ value: repo.kind, downloadsAllTime: repo.downloadsAllTime })),
    ),
    sizes: facet(
      models.map((model) => ({ value: model.sizeClass, downloadsAllTime: model.downloadsAllTime })),
    ),
  };
}
