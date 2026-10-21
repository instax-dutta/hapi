/**
 * A dataset store that reads from a directory.
 *
 * Used for local development, for the test suite and for the Node hosting
 * guide. It is deliberately not reachable from the Worker entry point, so the
 * Worker bundle never pulls in `node:fs`.
 */
import { readFile, stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { DatasetStore, StoredObject } from "./store.ts";

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

  async get(key: string): Promise<StoredObject | null> {
    const path = this.pathFor(key);
    try {
      const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      // The size and the modification time are a validator for the bytes. It
      // is not a cryptographic digest, and it does not need to be: the ETag
      // only has to change when the bytes change.
      return { text, etag: `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"` };
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
