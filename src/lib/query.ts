/**
 * The query engine.
 *
 * One filter, sort and paginate implementation, shared by the three list
 * endpoints. The differences between the endpoints are the sort keys and which
 * filters apply; they are data, not code.
 */
import type { Page } from "./types.ts";

export type SortDir = "asc" | "desc";

export interface CommonQuery {
  q: string;
  family: string;
  size: string;
  format: string;
  kind: string;
  version: string;
  author: string;
  origin: string;
  license: string;
  quant: string;
  verification: string;
  confidence: string;
  minDownloads: number;
  minScore: number;
  minLikes: number;
  minParams: number;
  maxParams: number;
  maxKl: number;
  bench: boolean;
  ranked: boolean;
  pareto: boolean;
  bestPick: boolean;
  implausible: string;
  direct: boolean;
  updatedAfter: string;
  /** The parsed boundary, so it is not parsed once per row. */
  updatedAfterTime: number;
  sort: string;
  dir: SortDir;
  page: number;
  perPage: number;
}

export const PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PER_PAGE = 50;

/** Sort keys whose natural order is ascending. */
const ASCENDING_BY_DEFAULT = new Set([
  "kl",
  "refusalRate",
  "refusals",
  "params",
  "model",
  "author",
]);

export function defaultDirFor(sort: string): SortDir {
  return ASCENDING_BY_DEFAULT.has(sort) ? "asc" : "desc";
}

function one(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

/**
 * Read the query string.
 *
 * An unknown sort key or an unknown direction falls back to the default rather
 * than erroring. A client that sends `sort=bogus` gets a usable answer.
 */
export function parseQuery(
  params: URLSearchParams,
  options: { sorts: readonly string[]; defaultSort: string },
): CommonQuery {
  const sortRaw = one(params, "sort").toLowerCase();
  const sort = options.sorts.includes(sortRaw) ? sortRaw : options.defaultSort;

  const dirRaw = one(params, "dir").toLowerCase();
  const dir: SortDir =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : defaultDirFor(sort);

  const pageRaw = Math.floor(Number(one(params, "page")) || 1);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const perPageRaw = Math.floor(Number(one(params, "perPage")) || DEFAULT_PER_PAGE);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw)
    ? perPageRaw
    : DEFAULT_PER_PAGE;

  const number = (key: string): number => {
    const raw = Math.floor(Number(one(params, key)) || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  };
  const minDownloads = number("minDownloads");
  const minScore = number("minScore");
  const minLikes = number("minLikes");
  const minParams = number("minParams");
  const maxParams = number("maxParams");
  const maxKl = number("maxKl");

  // An ISO date the row must be newer than. An unparseable value is ignored
  // rather than treated as a filter that matches nothing.
  const updatedAfterRaw = one(params, "updatedAfter").trim();
  const updatedAfterTime = Date.parse(updatedAfterRaw);
  const updatedAfter = Number.isFinite(updatedAfterTime) ? updatedAfterRaw : "";

  return {
    q: one(params, "q").trim().slice(0, 120),
    family: one(params, "family").trim().toLowerCase(),
    size: one(params, "size").trim().toLowerCase(),
    format: one(params, "format").trim().toLowerCase(),
    kind: one(params, "kind").trim().toLowerCase(),
    version: one(params, "version").trim(),
    author: one(params, "author").trim(),
    origin: one(params, "origin").trim(),
    license: one(params, "license").trim().toLowerCase(),
    quant: one(params, "quant").trim().toUpperCase(),
    verification: one(params, "verification").trim().toLowerCase(),
    confidence: one(params, "confidence").trim().toLowerCase(),
    minDownloads,
    minScore,
    minLikes,
    minParams,
    maxParams,
    maxKl,
    bench: one(params, "bench") === "1",
    ranked: one(params, "ranked") !== "0",
    pareto: one(params, "pareto") === "1",
    bestPick: one(params, "bestPick") === "1",
    implausible: one(params, "implausible").trim().toLowerCase(),
    direct: one(params, "direct") === "1",
    updatedAfter,
    updatedAfterTime: Number.isFinite(updatedAfterTime) ? updatedAfterTime : Number.NEGATIVE_INFINITY,
    sort,
    dir,
    page,
    perPage,
  };
}

/**
 * True when a row is newer than the requested date.
 *
 * The boundary is parsed once, when the query is read, so a filter over a
 * whole page does not parse the same string once per row.
 */
export function isUpdatedAfter(lastModified: string, boundary: number): boolean {
  if (!Number.isFinite(boundary)) return true;
  const time = Date.parse(lastModified);
  if (!Number.isFinite(time)) return true;
  return time >= boundary;
}

/** A filter decides whether one row belongs in the result. */
export type RowFilter<T> = (row: T, query: CommonQuery) => boolean;

/**
 * A comparator for one sort key.
 *
 * The direction is baked into the comparator by the route module, so a
 * comparator can place missing values last in both directions. A direction
 * applied outside the comparator would flip that placement, and a list whose
 * unknown values lead would look like a ranking.
 */
export type RowComparator<T> = (a: T, b: T) => number;

export interface QueryResult<T> extends Page<T> {
  rows: T[];
}

/**
 * Filter, sort and paginate.
 *
 * A page past the end returns the last page, not an empty page with a wrong
 * page number. A client walking pages never sees the list appear to end
 * early.
 */
export function runQuery<T>(
  rows: T[],
  query: CommonQuery,
  filter: RowFilter<T>,
  comparators: Record<string, RowComparator<T>>,
): QueryResult<T> {
  const filtered = rows.filter((row) => filter(row, query));

  const comparator = comparators[query.sort] ?? comparators.score ?? Object.values(comparators)[0];
  const fallback = comparators.id ?? (() => 0);

  filtered.sort((a, b) => {
    const primary = comparator(a, b);
    if (primary !== 0) return primary;
    return fallback(a, b);
  });

  const total = filtered.length;
  const perPage = query.perPage;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * perPage;

  return {
    rows: filtered.slice(start, start + perPage),
    total,
    page,
    pageCount,
    perPage,
  };
}

/** Case-insensitive substring match over a joined haystack. */
export function matchesText(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Compare two optional numbers.
 *
 * A missing value sorts last in both directions. A model with no published
 * score is not the best model, whichever way the list is sorted.
 */
export function compareNullable(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: SortDir,
): number {
  const aMissing = a === null || a === undefined || !Number.isFinite(a);
  const bMissing = b === null || b === undefined || !Number.isFinite(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const delta = (a as number) - (b as number);
  return dir === "asc" ? delta : -delta;
}

/** Compare two strings in the requested direction. */
export function compareText(a: string, b: string, dir: SortDir): number {
  const delta = a.localeCompare(b);
  return dir === "asc" ? delta : -delta;
}

/**
 * Put the corroborated rows ahead of the rest.
 *
 * Corroboration is not a user-facing sort key: it always outranks the chosen
 * sort, so an uncorroborated row can never sit at the top of any ordering.
 * That is what keeps a fabricated card from winning by writing two numbers.
 */
export function verificationFirst<T>(
  isVerified: (row: T) => boolean,
  compare: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const va = isVerified(a) ? 0 : 1;
    const vb = isVerified(b) ? 0 : 1;
    if (va !== vb) return va - vb;
    return compare(a, b);
  };
}
