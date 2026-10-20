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
import { apiRowsFromSnapshot } from "./lib/dataset-rows.ts";

const ROOT = process.cwd();
const RAW_PATH = join(ROOT, "data", "raw.json");
const DIST = join(ROOT, "dist");

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function main(): void {
  if (!existsSync(RAW_PATH)) {
    console.error("data/raw.json is missing. Run `npm run crawl` first.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawDataset;
  const snapshot = buildSnapshot(raw, { updatedAt: new Date().toISOString() });

  if (snapshot.origins.length === 0 || snapshot.recipes.length === 0) {
    console.error("Snapshot is empty; refusing to publish it.");
    process.exit(1);
  }

  const { meta, models, recipes, repos } = apiRowsFromSnapshot(snapshot);
  const dataset = { meta, models, recipes, repos };

  writeAtomic(join(DIST, "meta.json"), JSON.stringify(meta));
  writeAtomic(join(DIST, "models.json"), JSON.stringify({ origins: models }));
  writeAtomic(join(DIST, "recipes.json"), JSON.stringify({ recipes }));
  writeAtomic(join(DIST, "repos.json"), JSON.stringify({ repos }));
  writeAtomic(join(DIST, "dataset.json"), JSON.stringify(dataset));

  const size = (rows: unknown) =>
    (JSON.stringify(rows).length / 1024 / 1024).toFixed(2);

  console.log(
    [
      `Dataset written to ${DIST}`,
      `  version    ${meta.version}`,
      `  models     ${models.length} (${size(models)} MB)`,
      `  recipes    ${recipes.length} (${size(recipes)} MB)`,
      `  repos      ${repos.length} (${size(repos)} MB)`,
      `  families   ${meta.families.length}`,
    ].join("\n"),
  );
}

main();
