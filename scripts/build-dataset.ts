/**
 * Turn `data/raw.json` into the published dataset objects.
 *
 * Separate from the crawl so parser or scoring changes can be applied to
 * existing data without touching the network.
 *
 *   node scripts/build-dataset.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildSnapshot, type RawDataset } from "../src/core/snapshot.ts";
import { apiRowsFromSnapshot, type RawExtras } from "./lib/dataset-rows.ts";
import { buildCreators } from "./lib/creators.ts";
import type { DatasetMeta } from "../src/lib/types.ts";

const ROOT = process.cwd();
const RAW_PATH = join(ROOT, "data", "raw.json");
const DIST = join(ROOT, "dist");

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

interface RawFile extends RawDataset {
  repos: Array<
    RawDataset["repos"][number] & {
      discoveredBy: "tag" | "name";
      hasReadme: boolean;
    }
  >;
}

/**
 * The coverage floor.
 *
 * A crawl that hits a rate limit reads fewer cards, so fewer artifacts can be
 * classified, and the published dataset quietly shrinks. A client would see
 * the download totals drop and never know why. The build refuses to publish a
 * dataset that lost more than this much.
 */
const COVERAGE_FLOOR = 0.95;

function main(): void {
  if (!existsSync(RAW_PATH)) {
    console.error("data/raw.json is missing. Run `npm run crawl` first.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawFile;
  // The timestamp comes from the crawl, not from the clock. A build that
  // stamps the wall clock produces different bytes every run, so the version
  // hash changes when the data did not, and a refresh publishes nothing
  // useful.
  const snapshot = buildSnapshot(raw, { updatedAt: raw.crawledAt });

  if (snapshot.origins.length === 0 || snapshot.recipes.length === 0) {
    console.error("Snapshot is empty; refusing to publish it.");
    process.exit(1);
  }

  // The Hub metadata the snapshot does not carry.
  const extras: RawExtras = { tags: {}, safetensorsTotal: {} };
  for (const repo of raw.repos) {
    extras.tags![repo.id] = repo.tags;
    if (repo.safetensorsTotal !== null) extras.safetensorsTotal![repo.id] = repo.safetensorsTotal;
  }

  const { meta, models, recipes, repos } = apiRowsFromSnapshot(snapshot, extras);

  // The creator rows come from the discovery, so a creator's numbers are the
  // reach they actually generated, not only the artifacts the directory could
  // classify.
  const creators = buildCreators(
    raw.repos.map((repo) => ({
      id: repo.id,
      author: repo.author,
      downloads30d: repo.downloads30d,
      downloadsAllTime: repo.downloadsAllTime,
      likes: repo.likes,
      lastModified: repo.lastModified,
    })),
    recipes,
    repos,
    snapshot.updatedAt,
  );

  const published: DatasetMeta = { ...meta, counts: { ...meta.counts, creators: creators.length } };

  // The coverage guard. The previous published dataset is the baseline, so a
  // crawl that quietly read fewer cards cannot shrink the index.
  const previousPath = join(DIST, "meta.json");
  if (existsSync(previousPath) && !process.argv.includes("--force")) {
    try {
      const previous = JSON.parse(readFileSync(previousPath, "utf8")) as DatasetMeta;
      const before = previous.totals?.verifiedRepos ?? 0;
      const after = published.totals.verifiedRepos;
      if (before > 0 && after < before * COVERAGE_FLOOR) {
        console.error(
          `The dataset lost coverage: ${before} artifacts before, ${after} now. ` +
            "A crawl that read fewer cards would publish a smaller index. " +
            "Run `npm run build:dataset -- --force` if that is intended.",
        );
        process.exit(1);
      }
    } catch {
      // A previous dataset that cannot be read is not a reason to refuse.
    }
  }

  const dataset = { meta: published, models, recipes, repos, creators };

  // The snapshot is written too, so the sample builder and a human can read
  // the full document without rebuilding it.
  writeAtomic(join(ROOT, "data", "snapshot.json"), JSON.stringify(snapshot));

  writeAtomic(join(DIST, "meta.json"), JSON.stringify(published));
  writeAtomic(join(DIST, "models.json"), JSON.stringify({ origins: models }));
  writeAtomic(join(DIST, "recipes.json"), JSON.stringify({ recipes }));
  writeAtomic(join(DIST, "repos.json"), JSON.stringify({ repos }));
  writeAtomic(join(DIST, "creators.json"), JSON.stringify({ creators }));
  writeAtomic(join(DIST, "dataset.json"), JSON.stringify(dataset));

  const size = (rows: unknown) => (JSON.stringify(rows).length / 1024 / 1024).toFixed(2);

  console.log(
    [
      `Dataset written to ${DIST}`,
      `  version    ${meta.version}`,
      `  models     ${models.length} (${size(models)} MB)`,
      `  recipes    ${recipes.length} (${size(recipes)} MB)`,
      `  repos      ${repos.length} (${size(repos)} MB)`,
      `  creators   ${creators.length} (${size(creators)} MB)`,
      `  families   ${meta.families.length}`,
    ].join("\n"),
  );
}

main();
