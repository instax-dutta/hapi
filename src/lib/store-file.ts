/**
 * A dataset store that reads from a directory.
 *
 * Used for local development, for the test suite and for the Node hosting
 * guide. It is deliberately not reachable from the Worker entry point, so the
 * Worker bundle never pulls in `node:fs`.
 */
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import type { DatasetStore } from "./store.ts";

export class FileStore implements DatasetStore {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  /** Resolve a key inside the directory. A key may not escape it. */
  private pathFor(key: string): string {
    const safe = normalize(key).replace(/^([/\\])+/, "");
    if (safe.split(/[/\\]/).includes("..")) {
      throw new Error(`Refusing to read a key outside the dataset directory: ${key}`);
    }
    return join(this.directory, safe);
  }

  async get(key: string): Promise<string | null> {
    try {
      const text = await readFile(this.pathFor(key), "utf8");
      return text;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR") return null;
      throw error;
    }
  }
}

/** The directory the pipeline publishes into, and the server reads from. */
export function defaultDataDirectory(root = process.cwd()): string {
  return join(root, "dist");
}

export { sep };
