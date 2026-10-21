/**
 * The router.
 *
 * It matches a method and a path and hands over. It holds no domain
 * knowledge: a route module decides what a request means, the router only
 * decides which route module sees it.
 */
import type { DatasetLoader } from "./lib/dataset.ts";

export interface RouteContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
}

export type RouteHandler = (
  context: RouteContext,
  deps: RouteDeps,
) => Response | Promise<Response>;

/** What a route module is given besides the request. */
export interface RouteDeps {
  dataset: DatasetLoader;
  env: Record<string, unknown>;
  fetchImpl: typeof fetch;
}

export interface Route {
  method: string;
  /** A path pattern. A `:name` segment captures one segment, `:name*` the rest. */
  pattern: string;
  handler: RouteHandler;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

/**
 * True when a path segment carries a broken percent escape.
 *
 * The client sent a malformed URI, which is a bad request rather than a
 * missing resource.
 */
export function hasMalformedEncoding(pathname: string): boolean {
  return pathname
    .split("/")
    .filter((part) => part.length > 0)
    .some((part) => decodeSegment(part) === null);
}

/**
 * Decode one path segment.
 *
 * A malformed escape is a bad request, not a crash. `decodeURIComponent`
 * throws on a broken sequence, and the router runs before the handler's
 * error handling, so an uncaught throw would escape the error envelope.
 */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter((part) => part.length > 0);
  const pathParts = pathname.split("/").filter((part) => part.length > 0);

  // A greedy tail captures the rest of the path, so the path may have more
  // segments than the pattern. Every other pattern matches exactly.
  const last = patternParts[patternParts.length - 1];
  const greedy = Boolean(last && last.startsWith(":") && last.endsWith("*"));
  if (greedy) {
    if (pathParts.length < patternParts.length) return null;
  } else if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i];
    if (expected.startsWith(":") && expected.endsWith("*")) {
      const tail = pathParts.slice(i).map(decodeSegment);
      if (tail.some((part) => part === null)) return null;
      const value = tail.join("/");
      if (value.length === 0) return null;
      params[expected.slice(1, -1)] = value;
      return params;
    }
    const actual = pathParts[i];
    if (expected.startsWith(":")) {
      const value = decodeSegment(actual);
      if (value === null || value.length === 0) return null;
      params[expected.slice(1)] = value;
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

/**
 * Find the route for a request.
 *
 * A path that matches but a method that does not is reported separately, so
 * the handler can answer 405 instead of 404. A client that sends `POST` to a
 * read-only API deserves to be told the path exists.
 */
export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { match: RouteMatch | null; pathExists: boolean } {
  let pathExists = false;
  for (const route of routes) {
    const params = matchPattern(route.pattern, pathname);
    if (!params) continue;
    pathExists = true;
    if (route.method === method) {
      return { match: { route, params }, pathExists: true };
    }
  }
  return { match: null, pathExists };
}
