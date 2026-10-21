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
import type {
  BestRecipeSummary,
  CreatorRow,
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
  creators: CreatorRow[];
}

/** The Hub metadata the snapshot does not carry. */
export interface RawExtras {
  /** The Hub's own tags for a repository. */
  tags?: Record<string, string[]>;
  /** The total parameter count the Hub reports, in parameters. */
  safetensorsTotal?: Record<string, number>;
  /** The commit the crawl read. */
  sha?: Record<string, string>;
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
export function apiRowsFromSnapshot(snapshot: Snapshot, extras: RawExtras = {}): ApiRows {
  const originById = new Map(snapshot.origins.map((origin) => [origin.id, origin]));
  const repoById = new Map(snapshot.repos.map((repo) => [repo.id, repo]));

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
    isDirectConversion: repo.kind === "heretic",
    classificationEvidence: repo.classificationEvidence,
    baseModels: repo.declaredBaseModels,
    parentIds: repo.parentIds,
    tags: extras.tags?.[repo.id] ?? [],
    safetensorsTotal: extras.safetensorsTotal?.[repo.id] ?? null,
    benchmarkCount: repo.benchmarks.length,
    sha: extras.sha?.[repo.id] ?? "",
    metrics: {
      kl: repo.metrics.kl,
      refusals: repo.metrics.refusals,
      refusalTotal: repo.metrics.refusalTotal,
      confidence: repo.metrics.confidence,
      sourceRepoId: repo.metrics.sourceRepoId,
      evidence: repo.metrics.evidence,
    },
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
      licenses: [...new Set(members.map((member) => member.license).filter(Boolean))].sort() as string[],
      quantizations: [
        ...new Set(members.map((member) => member.quant).filter(Boolean)),
      ].sort() as string[],
      authors: [...new Set(members.map((member) => member.author))].sort(),
    };
  });

  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const models: ModelRow[] = snapshot.origins.map((origin) => {
    const cohort = recipes.filter((recipe) => recipe.originId === origin.id);
    const members = repos.filter((repo) => repo.originId === origin.id);
    const best = cohort.find((recipe) => recipe.bestPick) ?? null;
    const summary: BestRecipeSummary | null = best
      ? {
          id: best.id,
          author: best.author,
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
        }
      : null;

    return {
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
      repoCount: members.length,
      bestRecipeId: origin.bestRecipeId,
      bestScore: origin.bestScore,
      bestKl: origin.bestKl,
      bestRefusalRate: origin.bestRefusalRate,
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
      authors: [...new Set(members.map((member) => member.author))].sort(),
    };
  });

  const creators = buildCreators(repos, recipes, snapshot.updatedAt);
  const facets = buildFacets(recipes, repos, models);

  // The version is a content hash of the published rows. It changes when the
  // data changes and not when the build is merely re-run.
  const version = createHash("sha256")
    .update(JSON.stringify({ models, recipes, repos, creators }))
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
      creators: creators.length,
    },
    facets,
  };

  return { meta, models, recipes, repos, creators };
}

function buildCreators(
  repos: RepoRow[],
  recipes: RecipeRow[],
  updatedAt: string,
): CreatorRow[] {
  const byAuthor = new Map<string, RepoRow[]>();
  for (const repo of repos) {
    const list = byAuthor.get(repo.author) ?? [];
    list.push(repo);
    byAuthor.set(repo.author, list);
  }

  const recipesByAuthor = new Map<string, RecipeRow[]>();
  for (const recipe of recipes) {
    const list = recipesByAuthor.get(recipe.author) ?? [];
    list.push(recipe);
    recipesByAuthor.set(recipe.author, list);
  }

  const creators: CreatorRow[] = [];
  for (const [username, models] of byAuthor) {
    const authorRecipes = recipesByAuthor.get(username) ?? [];
    const sorted = [...authorRecipes].sort((a, b) => b.score - a.score);
    const best = sorted[0] ?? null;
    const totals = {
      modelCount: models.length,
      allTimeDownloads: models.reduce((sum, model) => sum + model.downloadsAllTime, 0),
      last30DaysDownloads: models.reduce((sum, model) => sum + model.downloads30d, 0),
    };

    creators.push({
      scope: "user",
      username,
      updatedAt,
      totals,
      rate: {
        downloadsPerSecond: estimateDownloadsPerSecond(totals.last30DaysDownloads),
        windowDays: RATE_WINDOW_DAYS,
        basis: "derived",
      },
      source: "Hugging Face Hub API",
      recipeCount: authorRecipes.length,
      originCount: new Set(models.map((model) => model.originId)).size,
      likes: models.reduce((sum, model) => sum + model.likes, 0),
      bestScore: best?.score ?? null,
      bestKl: best?.kl ?? null,
      bestRefusalRate: best?.refusalRate ?? null,
      verifiedCount: authorRecipes.filter(
        (recipe) => recipe.verification === "verified" || recipe.verification === "publisher",
      ).length,
      lastModified: models.map((model) => model.lastModified).sort().reverse()[0] ?? updatedAt,
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

function buildFacets(recipes: RecipeRow[], repos: RepoRow[], models: ModelRow[]): DatasetFacets {
  const versions = new Map<string, RepoRow[]>();
  for (const repo of repos) {
    if (!repo.hereticVersion) continue;
    const list = versions.get(repo.hereticVersion) ?? [];
    list.push(repo);
    versions.set(repo.hereticVersion, list);
  }

  return {
    versions: facet(
      [...versions.entries()].map(([value, list]) => ({
        value,
        downloadsAllTime: list.reduce((sum, repo) => sum + repo.downloadsAllTime, 0),
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
