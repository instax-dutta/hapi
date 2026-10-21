# Hosting on Node

The API is a `fetch(request, env, ctx)` handler with a `DatasetStore`
interface. On Node the store is a directory. Nothing changes in the request
path, and the same tests cover both runtimes.

This guide assumes a server you control. If you want the managed version, use
[cloudflare.md](cloudflare.md).

## 1. The dataset

The pipeline writes the published objects into `dist/`:

```bash
npm run crawl
npm run build:dataset
npm run build:stats
```

`dist/` now holds `meta.json`, `models.json`, `recipes.json`, `repos.json`,
`creators.json`, `stats.json` and `dataset.json`. The server reads that
directory.

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

Behind a reverse proxy, set `HAPI_HOST=0.0.0.0` and let the proxy terminate
TLS.

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
    server_name hapi.sdad.pro;

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

## 5. The schedule

```cron
17 */2 * * * cd /home/tejes/work/hapi && npm run refresh >> data/refresh.log 2>&1
```

The crawl is incremental, so a run that finds nothing new is cheap. The server
reads the dataset on each request and memoizes it per process, so a refresh is
picked up within a minute.

## The memory ceiling

The dataset is about 4 MB of JSON. Parsed, it is roughly 40 MB of heap. One
Node process is enough for a public read API; run a second process if the
traffic outgrows one core.
