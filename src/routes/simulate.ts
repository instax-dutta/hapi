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

/**
 * Read a number.
 *
 * An absent parameter takes the fallback. A parameter that is present but not
 * a number is a bad request, and it is not the same as an absent one: a rate
 * of zero is a real answer and a rate of "abc" is a mistake.
 */
function numberParam(
  query: URLSearchParams,
  key: string,
  fallback: number,
): { value: number; present: boolean; valid: boolean } {
  const raw = query.get(key);
  if (raw === null || raw.trim() === "") {
    return { value: fallback, present: false, valid: true };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { value: fallback, present: true, valid: false };
  }
  return { value, present: true, valid: true };
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
    const parsed = numberParam(query, "rate", 0);
    if (!parsed.valid) {
      return errorResponse(400, "bad_request", "The rate must be a number.");
    }
    rate = parsed.value;
    source = "rate";
  } else if (totalRaw !== null && totalRaw.trim() !== "") {
    const parsed = numberParam(query, "last30DaysDownloads", 0);
    if (!parsed.valid) {
      return errorResponse(400, "bad_request", "The 30-day total must be a number.");
    }
    const days = numberParam(query, "windowDays", 30);
    if (!days.valid) {
      return errorResponse(400, "bad_request", "The window must be a number of days.");
    }
    rate = estimateDownloadsPerSecond(parsed.value, days.value);
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
  if (!seconds.valid || !Number.isFinite(seconds.value) || seconds.value <= 0 || seconds.value > 86_400) {
    return errorResponse(400, "bad_request", "The window must be between 1 second and 24 hours.");
  }

  const seedRaw = numberParam(query, "seed", 1);
  if (!seedRaw.valid) {
    return errorResponse(400, "bad_request", "The seed must be a number.");
  }
  const seed = Math.floor(seedRaw.value);
  const random = mulberry32(seed);
  const events = sampleDownloadEvents(rate, seconds.value, random);

  return json(
    {
      source,
      rate,
      seconds: seconds.value,
      seed,
      events,
      expected: rate * seconds.value,
      method: "poisson",
      note: "Synthetic events drawn from a Poisson distribution. Not a measurement.",
    },
    { cache: "meta" },
  );
}
