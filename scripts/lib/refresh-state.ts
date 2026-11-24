import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** A rebuild is needed when the published signature does not match the source. */
export function needsBuild(last: string | null, current: string): boolean {
  return last !== current;
}

function collect(root: string, directory: string, out: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(root, path, out);
    } else if (/\.(ts|mjs|json)$/.test(entry.name)) {
      out.push(path);
    }
  }
}

/**
 * A hash of everything that can change the published rows.
 *
 * Download counts live in `raw.json`; parsing, scoring and row shaping live in
 * the source. Hashing both means a code fix rebuilds even when the crawl found
 * nothing new, while an unchanged run does not pay for a rebuild.
 */
export function sourceSignature(root: string, rawText: string): string {
  const files: string[] = [];
  for (const directory of ["src", "scripts/lib"]) {
    collect(root, join(root, directory), files);
  }
  files.push(join(root, "package.json"));
  files.sort();

  const hash = createHash("sha256").update(rawText);
  for (const file of files) {
    hash.update(relative(root, file));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 16);
}
