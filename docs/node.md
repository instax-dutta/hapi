# Hosting on Node

The API is a `fetch(request, env, ctx)` handler with a `DatasetStore`
interface. On Node the store is a directory. Nothing changes in the request
path, and the same tests cover both runtimes.

This guide assumes a server you control. If you want the managed version, use
[cloudflare.md](cloudflare.md).

## 1. The dataset

The pipeline writes each build into a staging directory and then switches the
`data/current` symlink to the finished version. The server reads that symlink,
so it never sees a half-written set of objects:

```bash
npm run crawl
HAPI_DIST_DIR=data/staging npm run build:dataset
HAPI_DIST_DIR=data/staging npm run build:stats
node scripts/publish-local.mjs data/staging
```

A published version holds `meta.json`, `models.json`, `recipes.json`,
`repos.json`, `creators.json`, `stats.json` and `dataset.json`. The previous
version stays under `data/versions/` as an immediate rollback. Point the
service at the symlink:

```ini
Environment=HAPI_DATA_DIR=/home/tejes/work/hapi/data/current
```

## 2. The server

```bash
node src/server-node.ts
```

It listens on `127.0.0.1:8787` by default.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HAPI_PORT` | `8787` | The port |
| `HAPI_HOST` | `127.0.0.1` | The interface to bind |
| `HAPI_DATA_DIR` | `./dist` | The directory holding the published dataset |
| `HAPI_RATE_LIMIT` | `600` | Requests per minute per client address. `0` disables the limiter |

Behind a reverse proxy, set `HAPI_HOST=0.0.0.0` and let the proxy terminate
TLS.

The process adds the transport concerns the handler does not carry:

- JSON over 1 KB is gzipped once per dataset version and the compressed bytes
  are reused, so the 14 MB bulk object compresses once rather than per request
- One JSON access line per request goes to stdout, so `journalctl -u hapi -o
  cat` is the access log
- The client address is `cf-connecting-ip`, then the first `x-forwarded-for`
  entry, then the socket address
- `SIGTERM` stops accepting connections, lets in-flight responses finish and
  exits

## 3. A systemd unit

```ini
[Unit]
Description=hapi - the Heretic API
After=network.target

[Service]
Type=simple
User=tejes
WorkingDirectory=/home/tejes/work/hapi
Environment=HAPI_HOST=0.0.0.0
Environment=HAPI_PORT=8787
Environment=HAPI_DATA_DIR=/home/tejes/work/hapi/dist
ExecStart=/usr/bin/node src/server-node.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hapi
```

## 4. nginx

```nginx
server {
    listen 443 ssl http2;
    server_name hapi.thevinod.lol;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The responses already carry the right `Cache-Control`, so nginx and the browser
cache them as the API intends.

## 5. An edge cache

The origin is one Node process, and the network path to it is the slowest part
of a request. If the host is behind Cloudflare, let the edge cache the public
reads. In the dashboard, **Caching** then **Cache Rules**, create a rule:

- When incoming requests match: `(http.host eq "hapi.thevinod.lol")`
- Then: **Eligible for cache**
- Edge TTL: **Use cache-control header if present**
- Browser TTL: **Respect origin**

Every response already sends `Cache-Control` with `s-maxage`, so the rule
applies the API's own freshness windows. Errors are `no-store` and are never
cached. Without the rule Cloudflare answers `cf-cache-status: DYNAMIC` and
every request crosses the tunnel to the origin.

## 6. The schedule

```cron
17 */2 * * * cd /home/tejes/work/hapi && flock -n data/refresh.lock env HF_TOKEN=$(cat /home/tejes/.config/hapi/hf_token) npm run refresh:server >> data/refresh.log 2>&1
```

`flock -n` drops a tick when the previous refresh is still running, so two
crawls can never race. `refresh:server` checks that the token is still
accepted, refuses an empty discovery, builds into staging, validates the
result and switches the symlink only after every gate passes. It hashes the raw
crawl together with the source; when neither changed, it skips the rebuild
entirely. A rejected token or a broken Hub answer stops the run before the last
good dataset is touched. The GitHub Actions workflow `monitor.yml` checks the
public API every two hours and opens an issue when it goes stale; a
`HEARTBEAT_URL` repository secret also catches a schedule that stops running
entirely.

The crawl is incremental, so a run that finds nothing new is cheap. The server
keeps every family parsed and re-reads one at most every five minutes, in the
background, so a refresh never blocks a request and a new dataset is picked up
within five minutes.

## The memory ceiling

The published dataset is about 28 MB on disk, and the parsed families measure
under 200 MB of heap. One Node process is enough for a public read API; run a
second process if the traffic outgrows one core, and raise the service's memory
limit accordingly.
