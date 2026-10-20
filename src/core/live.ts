/**
 * The live download statistics core.
 *
 * Ported from `heretic-live-agent/api/stats-core.js`. It is the measurement
 * half of that project's backend: discovery merging, deduplication, aggregation
 * and the derived download rate.
 *
 * The rule that shapes this file: downloads are measurements, the per-second
 * rate is a derivation. `estimateDownloadsPerSecond` extrapolates from the
 * 30-day mean and must never be presented as a measurement. Every caller
 * labels it as derived.
 */

export const SECONDS_PER_DAY = 24 * 60 * 60;

/** The Hub reports `downloads` over a rolling 30-day window. */
export const LIVE_RATE_WINDOW_DAYS = 30;

export interface HubModel {
  id?: string;
  downloads?: number;
  downloadsAllTime?: number;
  likes?: number;
  tags?: string[];
}

export interface TrackedModel {
  id: string;
  url: string;
  downloads: number;
  downloadsAllTime: number;
  likes: number;
  source: "tagged" | "named";
}

export interface DownloadTotals {
  modelCount: number;
  allTimeDownloads: number;
  last30DaysDownloads: number;
}

export interface ModelPage {
  models: HubModel[];
  next: string | null;
}

export interface FetchAllOptions {
  maxPages?: number;
}

/**
 * Walk a cursor-paginated listing to the end.
 *
 * `fetchPage` returns either a bare array or a `{ models, next }` page. The
 * page cap is a hard stop, not a suggestion: a silent truncation would
 * understate every total derived from the listing.
 */
export async function fetchAllModels(
  fetchPage: (params: unknown) => Promise<HubModel[] | ModelPage>,
  params: unknown,
  options: FetchAllOptions = {},
): Promise<HubModel[]> {
  const models: HubModel[] = [];
  let next: unknown = params;
  let pageCount = 0;
  const maxPages = options.maxPages ?? 100;

  while (next) {
    if (pageCount >= maxPages) {
      throw new Error(`Hugging Face pagination exceeded ${maxPages} pages.`);
    }
    const page = await fetchPage(next);
    const pageModels = Array.isArray(page) ? page : page?.models;
    if (!Array.isArray(pageModels)) throw new Error("Hugging Face returned an invalid model list.");
    models.push(...pageModels);
    next = Array.isArray(page) ? null : page.next || null;
    pageCount += 1;
  }

  return models;
}

/**
 * Merge the caller's expansions with the ones this API always needs.
 *
 * The Hub accepts both `expand` and `expand[]`. A pagination link carries
 * whatever the first request sent, so the expansions have to be re-applied to
 * every page or the later pages answer with fewer fields than the first.
 */
export function withModelExpansions(value: string): string {
  const url = new URL(value);
  const expandedFields = new Set<string>([
    ...url.searchParams.getAll("expand[]"),
    ...url.searchParams.getAll("expand"),
    "downloads",
    "downloadsAllTime",
    "tags",
  ]);
  url.searchParams.delete("expand");
  url.searchParams.delete("expand[]");
  expandedFields.forEach((field) => url.searchParams.append("expand[]", field));
  return url.toString();
}

export function isHereticModel(model: HubModel): boolean {
  const id = String(model?.id || "").toLowerCase();
  const tags = Array.isArray(model?.tags) ? model.tags.map((tag) => String(tag).toLowerCase()) : [];
  return tags.includes("heretic") || id.includes("heretic");
}

function toModel(model: HubModel, source: "tagged" | "named"): TrackedModel {
  return {
    id: String(model.id),
    url: `https://huggingface.co/${model.id}`,
    downloads: Number(model.downloads || 0),
    downloadsAllTime: Number(model.downloadsAllTime ?? 0),
    likes: Number(model.likes || 0),
    source,
  };
}

/**
 * Merge the tagged and named passes.
 *
 * The tagged pass wins a duplicate, because a model carrying the `heretic` tag
 * is a deliberate signal while a name match can be incidental. The result is
 * ordered by all-time downloads descending, which is the order the API
 * publishes.
 */
export function collectModels(
  tagged: HubModel[],
  named: HubModel[],
  options: { filterHeretic?: boolean } = {},
): TrackedModel[] {
  const filterHeretic = options.filterHeretic ?? false;
  const models = new Map<string, TrackedModel>();
  for (const model of tagged) {
    if (!filterHeretic || isHereticModel(model)) models.set(String(model.id), toModel(model, "tagged"));
  }
  for (const model of named) {
    const id = String(model.id);
    if (!models.has(id) && (!filterHeretic || isHereticModel(model))) {
      models.set(id, toModel(model, "named"));
    }
  }
  return [...models.values()].sort((a, b) => b.downloadsAllTime - a.downloadsAllTime);
}

export function aggregate(models: TrackedModel[]): DownloadTotals {
  return models.reduce<DownloadTotals>(
    (totals, model) => ({
      modelCount: totals.modelCount + 1,
      allTimeDownloads: totals.allTimeDownloads + Number(model.downloadsAllTime || 0),
      last30DaysDownloads: totals.last30DaysDownloads + Number(model.downloads || 0),
    }),
    { modelCount: 0, allTimeDownloads: 0, last30DaysDownloads: 0 },
  );
}

/**
 * A monotonically increasing request token.
 *
 * A live ticker starts several refreshes at once and only the newest one may
 * write to the screen. This is the token that decides which is newest.
 */
export function createRequestGate(): { start(): number; isCurrent(requestId: number): boolean } {
  let currentRequest = 0;
  return {
    start() {
      currentRequest += 1;
      return currentRequest;
    },
    isCurrent(requestId: number) {
      return requestId === currentRequest;
    },
  };
}

/**
 * The derived download rate: the 30-day mean expressed per second.
 *
 * This is an extrapolation, not a measurement. It says "the recent average,
 * continued". It never says "the rate right now".
 */
export function estimateDownloadsPerSecond(
  last30DaysDownloads: number,
  windowDays: number = LIVE_RATE_WINDOW_DAYS,
): number {
  const total = Number(last30DaysDownloads || 0);
  const windowSeconds = Number(windowDays || 0) * SECONDS_PER_DAY;
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return 0;
  return total / windowSeconds;
}

function sampleStandardNormal(random: () => number): number {
  // Box-Muller. The guards keep u and v away from zero so the log stays finite.
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Whole-download arrivals for one tick.
 *
 * A Poisson draw whose long-run mean is exactly the rate, so the counter jumps
 * like real traffic (0, 3, 9, 5) instead of creeping by a fractional average.
 * Downloads are integers; the average is not a download.
 *
 * Precondition: `random` must be a uniform [0, 1) PRNG. A degenerate constant
 * still terminates (via the guard) but the draw is meaningless.
 */
export function sampleDownloadEvents(
  ratePerSecond: number,
  elapsedSeconds: number,
  random: () => number = Math.random,
): number {
  const lambda = Number(ratePerSecond || 0) * Number(elapsedSeconds || 0);
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  const rand = typeof random === "function" ? random : Math.random;
  if (lambda < 30) {
    // Knuth's product method. Exact for a small mean, and it never logs.
    const limit = Math.exp(-lambda);
    const maxGuard = Math.ceil(lambda * 10) + 100;
    let count = 0;
    let p = 1;
    let guard = 0;
    do {
      count += 1;
      p *= rand();
      guard += 1;
    } while (p > limit && guard < maxGuard);
    return count - 1;
  }
  const normal = sampleStandardNormal(rand);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal));
}
