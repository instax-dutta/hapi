/**
 * The download simulation endpoint.
 *
 * The live site animates a download counter by drawing whole arrivals from a
 * Poisson distribution. This endpoint exposes that draw as data: the same
 * rate, the same window and a seed, so a client can reproduce the exact
 * sequence the server would produce.
 *
 * It is a measurement aid, not a forecast. The events are synthetic and the
 * response says so.
 */
import { errorResponse, json } from "../lib/http.ts";
import { estimateDownloadsPerSecond, sampleDownloadEvents } from "../core/live.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

/** A small, fast, seeded PRNG. Deterministic for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function numberParam(query: URLSearchParams, key: string, fallback: number): number {
  const raw = query.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function simulate(context: RouteContext, _deps: RouteDeps): Promise<Response> {
  const query = context.query;

  // A caller may give either a rate directly or a 30-day total to derive one
  // from. The derived form is the same arithmetic the stats endpoint uses.
  const rateRaw = query.get("rate");
  const totalRaw = query.get("last30DaysDownloads");
  let rate: number;
  let source: "rate" | "last30DaysDownloads";

  if (rateRaw !== null && rateRaw.trim() !== "") {
    rate = numberParam(query, "rate", 0);
    source = "rate";
  } else if (totalRaw !== null && totalRaw.trim() !== "") {
    const days = numberParam(query, "windowDays", 30);
    rate = estimateDownloadsPerSecond(numberParam(query, "last30DaysDownloads", 0), days);
    source = "last30DaysDownloads";
  } else {
    return errorResponse(
      400,
      "bad_request",
      "Give a `rate` in downloads per second, or a `last30DaysDownloads` total to derive one from.",
    );
  }

  if (!Number.isFinite(rate) || rate < 0) {
    return errorResponse(400, "bad_request", "The rate must be a finite number of zero or more.");
  }

  const seconds = numberParam(query, "seconds", 60);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86_400) {
    return errorResponse(400, "bad_request", "The window must be between 1 second and 24 hours.");
  }

  const seed = Math.floor(numberParam(query, "seed", 1));
  const random = mulberry32(seed);
  const events = sampleDownloadEvents(rate, seconds, random);

  return json(
    {
      source,
      rate,
      seconds,
      seed,
      events,
      expected: rate * seconds,
      method: "poisson",
      note: "Synthetic events drawn from a Poisson distribution. Not a measurement.",
    },
    { cache: "meta" },
  );
}
