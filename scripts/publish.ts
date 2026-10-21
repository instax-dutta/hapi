/**
 * Publish the dataset objects to a Cloudflare R2 bucket.
 *
 *   node scripts/publish.ts --r2 hapi
 *   HAPI_R2_BUCKET=hapi node scripts/publish.ts
 *
 * Without a bucket the script does nothing and says so: the dataset is
 * already in `dist/`, which is where the Node server reads it from.
 *
 * Publishing is content addressed. An object whose bytes did not change is
 * not uploaded again, and the state is kept per bucket, so publishing to one
 * bucket never cancels a publish to another.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");

const OBJECTS = [
  "meta.json",
  "models.json",
  "recipes.json",
  "repos.json",
  "creators.json",
  "stats.json",
  "dataset.json",
];

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function statePath(bucket: string): string {
  return join(ROOT, "data", `publish-state.${bucket}.json`);
}

function readState(bucket: string): Record<string, string> {
  const path = statePath(bucket);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeState(bucket: string, state: Record<string, string>): void {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(statePath(bucket), JSON.stringify(state, null, 2));
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error("dist/ is missing. Run `npm run build:dataset` first.");
    process.exit(1);
  }

  const bucket = arg("r2") ?? process.env.HAPI_R2_BUCKET ?? null;
  if (!bucket) {
    console.log("No bucket configured. The dataset is in dist/ and needs no upload.");
    return;
  }

  const previous = readState(bucket);
  const next: Record<string, string> = {};
  const changed: string[] = [];

  for (const name of OBJECTS) {
    const path = join(DIST, name);
    if (!existsSync(path)) {
      console.error(`dist/${name} is missing. Run the build first.`);
      process.exit(1);
    }
    const content = readFileSync(path, "utf8");
    const hash = digest(content);
    next[name] = hash;
    if (previous[name] !== hash) changed.push(name);
  }

  for (const name of changed) {
    console.log(`uploading ${name} to r2://${bucket}/${name}`);
    const result = spawnSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${bucket}/${name}`, "--file", join(DIST, name)],
      { stdio: "inherit", cwd: ROOT },
    );
    if (result.status !== 0) {
      console.error(`upload of ${name} failed`);
      process.exit(result.status ?? 1);
    }
  }

  writeState(bucket, next);
  console.log(
    changed.length === 0
      ? `Nothing changed. r2://${bucket} is already current.`
      : `Published ${changed.length} object(s) to r2://${bucket}: ${changed.join(", ")}`,
  );
}

main();
