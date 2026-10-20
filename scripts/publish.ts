/**
 * Publish the dataset objects.
 *
 * The target is a directory by default, which is what the Node server reads
 * and what the test suite uses. With `--r2 <bucket>` the same objects are
 * uploaded to a Cloudflare R2 bucket through the Wrangler CLI.
 *
 *   node scripts/publish.ts
 *   node scripts/publish.ts --r2 hapi
 *
 * Publishing is content addressed: an object whose bytes did not change is not
 * uploaded again.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const STATE = join(ROOT, "data", "publish-state.json");

const OBJECTS = [
  "meta.json",
  "models.json",
  "recipes.json",
  "repos.json",
  "stats.json",
  "creators.json",
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

function readState(): Record<string, string> {
  if (!existsSync(STATE)) return {};
  try {
    return JSON.parse(readFileSync(STATE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeState(state: Record<string, string>): void {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error("dist/ is missing. Run `npm run build:dataset` first.");
    process.exit(1);
  }

  const previous = readState();
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

  const bucket = arg("r2");
  if (bucket) {
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
  } else {
    const available = readdirSync(DIST);
    for (const name of available) {
      if (!OBJECTS.includes(name)) continue;
      if (!changed.includes(name)) continue;
      console.log(`publishing ${name}`);
    }
  }

  writeState(next);
  console.log(
    changed.length === 0
      ? "Nothing changed. The published dataset is already current."
      : `Published ${changed.length} object(s): ${changed.join(", ")}`,
  );
}

main();
