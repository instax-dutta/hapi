/**
 * Compute the download statistics.
 *
 * This is the `heretic-live-agent` backend, run offline. The same discovery,
 * the same deduplication, the same aggregation and the same derived rate, but
 * measured at build time so every client sees the same numbers and the request
 * path never touches the Hub.
 *
 * Two scopes are published:
 *   indexed    - the artifacts the directory actually publishes
 *   discovered - every model the tag-and-name index found, whether or not the
 *                directory could place it under a model
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
} from "../src/core/live.ts";
import type { RawRepo } from "../src/core/types.ts";
import type { DownloadTotals, StatsScope } from "../src/lib/types.ts";

const ROOT = process.cwd();
const RAW_PATH = join(ROOT, "data", "raw.json");
const REPOS_PATH = join(ROOT, "dist", "repos.json");
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
  const discovered = collectModels(tagged, named);
  const discoveredTotals = aggregate(discovered);

  // The indexed scope: the artifacts the directory publishes. A missing list
  // is a failed build, not an empty measurement. Publishing a zero would
  // tell every client the ecosystem is empty.
  if (!existsSync(REPOS_PATH)) {
    console.error("dist/repos.json is missing. Run `npm run build:dataset` first.");
    process.exit(1);
  }
  const repos = (JSON.parse(readFileSync(REPOS_PATH, "utf8")) as { repos: RawRepo[] }).repos;
  if (repos.length === 0) {
    console.error("dist/repos.json holds no artifacts. Refusing to publish an empty measurement.");
    process.exit(1);
  }
  const indexedTotals: DownloadTotals = aggregate(
    repos.map((repo) => ({
      id: repo.id,
      url: `https://huggingface.co/${repo.id}`,
      downloads: repo.downloads30d,
      downloadsAllTime: repo.downloadsAllTime,
      likes: repo.likes,
      source: "tagged" as const,
    })),
  );

  const updatedAt = raw.crawledAt;
  // The headline is the discovered scope: every model the tag-and-name index
  // found, which is the same arithmetic the live counter at
  // `heretic.sdad.pro` uses. The indexed scope is the subset the directory
  // could classify, published beside it.
  const scope: StatsScope = {
    scope: "global",
    username: null,
    updatedAt,
    totals: discoveredTotals,
    rate: rateOf(discoveredTotals),
    source: "Hugging Face Hub API · heretic tag + name index",
  };

  const document = {
    ...scope,
    indexed: indexedTotals,
    indexedRate: rateOf(indexedTotals),
  };

  writeAtomic(join(DIST, "stats.json"), JSON.stringify(document));

  console.log(
    [
      `Stats written to ${DIST}`,
      `  discovered   ${discoveredTotals.modelCount} models, ${discoveredTotals.allTimeDownloads.toLocaleString("en-US")} all time, ${discoveredTotals.last30DaysDownloads.toLocaleString("en-US")} in 30 days`,
      `  indexed      ${indexedTotals.modelCount} artifacts, ${indexedTotals.allTimeDownloads.toLocaleString("en-US")} all time`,
      `  rate         ${scope.rate.downloadsPerSecond.toFixed(4)}/s (derived)`,
    ].join("\n"),
  );
}

main();
