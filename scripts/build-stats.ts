/**
 * Compute the download statistics.
 *
 * This is the `heretic-live-agent` backend, run offline. The same discovery,
 * the same deduplication, the same aggregation and the same derived rate, but
 * measured at build time so every client sees the same numbers and the request
 * path never touches the Hub.
 *
 *   node scripts/build-stats.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  aggregate,
  collectModels,
  estimateDownloadsPerSecond,
  LIVE_RATE_WINDOW_DAYS,
  type HubModel,
  type TrackedModel,
} from "../src/core/live.ts";
import type { RawRepo } from "../src/core/types.ts";
import type { CreatorStats, DownloadTotals, StatsScope } from "../src/lib/types.ts";

const ROOT = process.cwd();
const RAW_PATH = join(ROOT, "data", "raw.json");
const DIST = join(ROOT, "dist");

interface RawFile {
  crawledAt: string;
  repos: Array<RawRepo & { discoveredBy: "tag" | "name" }>;
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function rateOf(totals: DownloadTotals): StatsScope["rate"] {
  return {
    downloadsPerSecond: estimateDownloadsPerSecond(totals.last30DaysDownloads),
    windowDays: LIVE_RATE_WINDOW_DAYS,
    basis: "derived",
  };
}

/** A Hub listing entry, reduced to what the statistics core reads. */
function toHubModel(repo: RawRepo): HubModel {
  return {
    id: repo.id,
    downloads: repo.downloads30d,
    downloadsAllTime: repo.downloadsAllTime,
    likes: repo.likes,
    tags: repo.tags,
  };
}

function main(): void {
  if (!existsSync(RAW_PATH)) {
    console.error("data/raw.json is missing. Run `npm run crawl` first.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawFile;
  const tagged: HubModel[] = [];
  const named: HubModel[] = [];
  for (const repo of raw.repos) {
    (repo.discoveredBy === "tag" ? tagged : named).push(toHubModel(repo));
  }

  // The same merge the live endpoint used: the tagged pass wins a duplicate.
  const all = collectModels(tagged, named);

  const totals = aggregate(all);
  const updatedAt = raw.crawledAt;
  const scope: StatsScope = {
    scope: "global",
    username: null,
    updatedAt,
    totals,
    rate: rateOf(totals),
    source: "Hugging Face Hub API · heretic tag + name index",
  };

  // Per creator. The discovery already covered the whole Hub with the same two
  // passes the live endpoint used, so a creator's models are the ones this
  // crawl found. No extra Hub request is needed, and none is made.
  const byAuthor = new Map<string, TrackedModel[]>();
  for (const model of all) {
    const author = model.id.split("/")[0] ?? "";
    if (!author) continue;
    const list = byAuthor.get(author) ?? [];
    list.push(model);
    byAuthor.set(author, list);
  }

  const creators: Record<string, CreatorStats> = {};
  for (const [author, models] of byAuthor) {
    const creatorTotals = aggregate(models);
    creators[author] = {
      scope: "user",
      username: author,
      updatedAt,
      totals: creatorTotals,
      rate: rateOf(creatorTotals),
      source: "Hugging Face Hub API · heretic tag + name index",
      models: models.map((model) => ({
        id: model.id,
        url: model.url,
        downloads: model.downloads,
        downloadsAllTime: model.downloadsAllTime,
        likes: model.likes,
      })),
    };
  }

  writeAtomic(join(DIST, "stats.json"), JSON.stringify(scope));
  writeAtomic(join(DIST, "creators.json"), JSON.stringify({ creators }));

  console.log(
    [
      `Stats written to ${DIST}`,
      `  models      ${totals.modelCount}`,
      `  all time    ${totals.allTimeDownloads.toLocaleString("en-US")}`,
      `  30 days     ${totals.last30DaysDownloads.toLocaleString("en-US")}`,
      `  rate        ${scope.rate.downloadsPerSecond.toFixed(4)}/s (derived)`,
      `  creators    ${Object.keys(creators).length}`,
    ].join("\n"),
  );
}

main();
