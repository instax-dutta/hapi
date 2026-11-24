/**
 * The Node entry point.
 *
 * The same handler, served by Node instead of a Worker. It exists so the API
 * can be run, tested and self-hosted without a Cloudflare account.
 *
 *   node src/server-node.ts            # serves http://127.0.0.1:8787
 *   HAPI_PORT=3000 node src/server-node.ts
 *
 * Everything here is transport: gzip, a per-IP rate limit, one access log
 * line per request and a clean drain on SIGTERM. None of it reaches the
 * portable handler.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import handler from "./index.ts";
import { errorResponse } from "./lib/http.ts";
import { RateLimiter } from "./lib/rate-limit.ts";
import { FileStore } from "./lib/store-file.ts";
import type { DatasetStore } from "./lib/store.ts";

const gzipAsync = promisify(gzip);

const port = Number(process.env.HAPI_PORT ?? 8787);
const host = process.env.HAPI_HOST ?? "127.0.0.1";
const directory = process.env.HAPI_DATA_DIR ?? join(process.cwd(), "dist");
const rateLimit = Number(process.env.HAPI_RATE_LIMIT ?? 600);

const store: DatasetStore = new FileStore(directory);
const limiter = new RateLimiter(Number.isFinite(rateLimit) ? rateLimit : 600, 60_000);

/** Below this, compressing costs more than the bytes it saves. */
const COMPRESS_MIN_BYTES = 1024;

/** Only bodies this large are worth caching compressed. */
const CACHE_MIN_BYTES = 64 * 1024;

/** Compressed bodies are keyed by ETag and length, kept for the last few. */
const GZIP_CACHE_MAX = 8;
const gzipCache = new Map<string, Buffer>();

/** The client address. Behind the tunnel Cloudflare sets `cf-connecting-ip`. */
function clientIp(request: IncomingMessage): string {
  const direct = request.headers["cf-connecting-ip"];
  if (typeof direct === "string" && direct.length > 0) return direct;
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0].trim();
    if (first.length > 0) return first;
  }
  return request.socket.remoteAddress ?? "unknown";
}

/** True when the client accepts a gzip representation. */
function acceptsGzip(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(",").some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (name !== "gzip") return false;
    const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    return q ? Number(q.slice(2)) > 0 : true;
  });
}

/** Compress once per validator, then serve the cached bytes. */
async function compressed(body: Buffer, key: string | undefined): Promise<Buffer> {
  if (key) {
    const hit = gzipCache.get(key);
    if (hit) {
      // Keep the entry most recently used at the end of the map.
      gzipCache.delete(key);
      gzipCache.set(key, hit);
      return hit;
    }
  }

  const encoding = await gzipAsync(body, { level: 6 });
  if (key && body.length >= CACHE_MIN_BYTES) {
    if (gzipCache.size >= GZIP_CACHE_MAX) {
      const oldest = gzipCache.keys().next();
      if (!oldest.done) gzipCache.delete(oldest.value);
    }
    gzipCache.set(key, encoding);
  }
  return encoding;
}

/**
 * Write one response: negotiate gzip, set the length and log the request.
 *
 * A failed handler already becomes an error envelope, so this path never
 * throws on a normal request.
 */
async function send(
  request: IncomingMessage,
  response: ServerResponse,
  result: Response,
  ip: string,
  startedAt: bigint,
): Promise<void> {
  const headers = Object.fromEntries(result.headers);
  const type = (headers["content-type"] ?? "").toLowerCase();
  const isJson = type.startsWith("application/json");

  // The representation depends on Accept-Encoding whenever it can be
  // compressed, so caches must key on it too.
  if (isJson && result.status === 200) {
    headers["vary"] = headers["vary"] ? `${headers["vary"]}, Accept-Encoding` : "Accept-Encoding";
  }

  let body: Buffer | null = null;
  let encoded = false;
  const wantsGzip =
    isJson &&
    result.status === 200 &&
    !headers["content-encoding"] &&
    acceptsGzip(request.headers["accept-encoding"]);
  const declared = headers["content-length"] ? Number(headers["content-length"]) : null;
  const cacheKey =
    headers["etag"] && declared !== null ? `${headers["etag"]}:${declared}` : undefined;

  // A cached compressed copy lets this response skip reading the body at all.
  if (wantsGzip && cacheKey) {
    const hit = gzipCache.get(cacheKey);
    if (hit) {
      body = hit;
      encoded = true;
    }
  }

  if (!body && result.body) body = Buffer.from(await result.arrayBuffer());

  if (wantsGzip && body && !encoded && body.length >= COMPRESS_MIN_BYTES) {
    body = await compressed(body, headers["etag"] ? `${headers["etag"]}:${body.length}` : undefined);
    encoded = true;
  }

  if (encoded) headers["content-encoding"] = "gzip";

  if (body) headers["content-length"] = String(body.length);
  response.writeHead(result.status, headers);
  response.end(body ?? undefined);

  const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      ip,
      method: request.method,
      path: request.url,
      status: result.status,
      ms: Math.round(ms * 10) / 10,
      bytes: body?.length ?? 0,
      gzip: encoded,
    }),
  );
}

const server = createServer((request, response) => {
  const startedAt = process.hrtime.bigint();
  const ip = clientIp(request);

  const decision = limiter.take(ip);
  if (!decision.allowed) {
    const limited = errorResponse(429, "rate_limited", "Too many requests. Retry shortly.", {
      "Retry-After": String(decision.retryAfterSeconds),
    });
    void send(request, response, limited, ip, startedAt);
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const incoming = new Request(url, {
    method: request.method,
    headers: request.headers as Record<string, string>,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(""),
  });

  handler
    .fetch(
      incoming,
      {
        HAPI_STORE: store,
        // The Node process is long-lived, so keep every family parsed and
        // refresh in the background once the dataset version is old.
        // A published symlink switch is visible to readers within one minute.
        HAPI_LOADER: { ttlMs: 60_000, maxFamilies: 6, background: true },
      },
      undefined,
    )
    .then((result) => send(request, response, result, ip, startedAt))
    .catch((error) => {
      console.error("hapi: request failed", error);
      const failed = errorResponse(500, "internal_error", "Something went wrong.");
      void send(request, response, failed, ip, startedAt);
    });
});

// Keep the tunnel's pooled connections warm instead of reconnecting every
// few seconds.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

/** Stop accepting connections, let in-flight responses finish, then exit. */
function shutdown(signal: string): void {
  console.log(`hapi: ${signal} received, draining`);
  server.close(() => process.exit(0));
  // Idle keep-alive sockets would otherwise hold the drain for the keep-alive
  // window. In-flight responses still finish.
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
  console.log(`hapi listening on http://${host}:${port}`);
  console.log(`dataset directory: ${directory}`);
  console.log(
    rateLimit > 0
      ? `rate limit: ${rateLimit} requests per minute per client`
      : "rate limit: disabled",
  );
});
