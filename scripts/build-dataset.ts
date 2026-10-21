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

  const { meta, models, recipes, repos, creators } = apiRowsFromSnapshot(snapshot, extras);
  const dataset = { meta, models, recipes, repos, creators };

  // The snapshot is written too, so the sample builder and a human can read
  // the full document without rebuilding it.
  writeAtomic(join(ROOT, "data", "snapshot.json"), JSON.stringify(snapshot));

  writeAtomic(join(DIST, "meta.json"), JSON.stringify(meta));
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
