/**
 * The download statistics endpoints.
 *
 * The measured totals come from the published dataset, so they are the same
 * numbers for every client and never depend on when a request happened to
 * arrive. The per-second rate is derived from the 30-day mean and is always
 * labelled as derived.
 */
import { errorResponse, json } from "../lib/http.ts";
import type { CreatorStats } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export async function globalStats(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const stats = await deps.dataset.stats();
  return json(stats, { cache: "stats" });
}

export async function creatorStats(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const username = context.params.username;
  const creators = await deps.dataset.creators();

  // Hugging Face usernames are case-insensitive for lookup, so a client that
  // typed `Coder3101` must not get a 404 for `coder3101`.
  const wanted = username.toLowerCase();
  const entry = Object.entries(creators).find(([name]) => name.toLowerCase() === wanted);
  if (!entry) {
    return errorResponse(404, "not_found", `No creator matches the username "${username}".`);
  }

  const [name, stats] = entry as [string, CreatorStats];
  return json({ ...stats, username: stats.username || name }, { cache: "stats" });
}
