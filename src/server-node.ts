/**
 * The Node entry point.
 *
 * The same handler, served by Node instead of a Worker. It exists so the API
 * can be run, tested and self-hosted without a Cloudflare account.
 *
 *   node src/server-node.ts            # serves http://127.0.0.1:8787
 *   HAPI_PORT=3000 node src/server-node.ts
 */
import { createServer } from "node:http";
import { join } from "node:path";
import handler from "./index.ts";
import { errorResponse } from "./lib/http.ts";
import { FileStore } from "./lib/store-file.ts";
import type { DatasetStore } from "./lib/store.ts";

const port = Number(process.env.HAPI_PORT ?? 8787);
const host = process.env.HAPI_HOST ?? "127.0.0.1";
const directory = process.env.HAPI_DATA_DIR ?? join(process.cwd(), "dist");

const store: DatasetStore = new FileStore(directory);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const body = Buffer.from("");
  const incoming = new Request(url, {
    method: request.method,
    headers: request.headers as Record<string, string>,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
  });

  handler
    .fetch(incoming, { HAPI_STORE: store }, undefined)
    .then(async (result) => {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(result.body ? Buffer.from(await result.arrayBuffer()) : undefined);
    })
    .catch(async (error) => {
      console.error("hapi: request failed", error);
      const failed = errorResponse(500, "internal_error", "Something went wrong.");
      response.writeHead(failed.status, Object.fromEntries(failed.headers));
      response.end(await failed.text());
    });
});

server.listen(port, host, () => {
  console.log(`hapi listening on http://${host}:${port}`);
  console.log(`dataset directory: ${directory}`);
});
