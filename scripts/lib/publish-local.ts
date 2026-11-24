import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";

/** How many published versions stay on disk. The current one and one rollback. */
const KEEP = 2;

/**
 * Publish a built staging directory by switching one symlink.
 *
 * Reading a set of files that is being written one by one can mix an old
 * `models.json` with a new `recipes.json`. A reader of `current` sees one
 * complete version at every instant, and the previous version stays available
 * as an immediate rollback.
 */
export function publishLocal(root: string, staging: string): string {
  const meta = JSON.parse(readFileSync(join(staging, "meta.json"), "utf8")) as { version?: string };
  const version = meta.version;
  if (typeof version !== "string" || !/^[A-Za-z0-9._-]+$/.test(version)) {
    throw new Error(`The staging meta.json has no usable version: ${String(version)}`);
  }

  const versions = join(root, "versions");
  mkdirSync(versions, { recursive: true });
  const target = join(versions, version);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);

  const current = join(root, "current");
  if (existsSync(current) && !lstatSync(current).isSymbolicLink()) {
    throw new Error(`${current} is a directory. Move it aside before switching to symlinks.`);
  }
  const temporary = join(root, `.current.${process.pid}.tmp`);
  symlinkSync(relative(root, target), temporary, "dir");
  renameSync(temporary, current);

  const kept = readdirSync(versions)
    .map((name) => ({ name, at: statSync(join(versions, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .slice(0, KEEP)
    .map((entry) => entry.name);
  for (const name of readdirSync(versions)) {
    if (!kept.includes(name)) rmSync(join(versions, name), { recursive: true, force: true });
  }

  return version;
}
