/**
 * The dataset loader.
 *
 * The published dataset is split per entity family on purpose. A request for
 * the artifact list must not pay the parse cost of the origin and recipe data,
 * and the other way around. Each family is loaded on first use and memoized
 * per isolate, so a warm isolate pays the parse once.
 */
import type {
  CreatorRow,
  DatasetMeta,
  ModelRow,
  RecipeRow,
  RepoRow,
  StatsScope,
} from "./types.ts";
import { DatasetUnavailableError, KEYS, type DatasetStore, type StoredObject } from "./store.ts";

/** How long a memoized family stays fresh before it is read again. */
const MEMO_TTL_MS = 30_000;

interface MemoEntry {
  value: unknown;
  at: number;
}

/**
 * The memo is keyed by the store instance, so a test that swaps the store
 * never reads a stale family from a previous one.
 */
let memos = new WeakMap<object, Map<string, MemoEntry>>();

/**
 * How many families an isolate keeps parsed at once.
 *
 * Two is enough for the common pairing (a list of ablations, then the origin
 * of each) and it bounds the heap: the full corpus is large enough that
 * holding every family at once would not fit in an isolate.
 */
const MEMO_FAMILIES = 2;

export class DatasetLoader {
  private readonly store: DatasetStore;

  constructor(store: DatasetStore) {
    this.store = store;
  }

  private async load<T>(key: string): Promise<T> {
    const storeKey = this.store as unknown as object;
    let perStore = memos.get(storeKey);
    if (!perStore) {
      perStore = new Map<string, MemoEntry>();
      memos.set(storeKey, perStore);
    }

    const hit = perStore.get(key);
    const now = Date.now();
    if (hit && now - hit.at < MEMO_TTL_MS) {
      // Refresh the position, so the least recently used family is the one
      // that gets dropped.
      perStore.delete(key);
      perStore.set(key, hit);
      return hit.value as T;
    }

    const stored = await this.store.get(key);
    if (stored === null) {
      throw new DatasetUnavailableError(`The dataset object "${key}" is missing.`);
    }

    let value: T;
    try {
      value = JSON.parse(stored.text) as T;
    } catch (error) {
      throw new DatasetUnavailableError(
        `The dataset object "${key}" is not valid JSON.`,
      );
    }

    // Refresh the position, so the family that was just re-read is not the
    // first one to be dropped.
    perStore.delete(key);
    perStore.set(key, { value, at: now });
    while (perStore.size > MEMO_FAMILIES) {
      const oldest = perStore.keys().next();
      if (oldest.done) break;
      perStore.delete(oldest.value);
    }
    return value;
  }

  /**
   * One dataset object, as the store holds it.
   *
   * The bulk endpoint serves the published bytes without parsing them. A
   * multi-megabyte document that is only downloaded does not need to be
   * understood by the server.
   */
  async raw(key: string): Promise<StoredObject> {
    const stored = await this.store.get(key);
    if (stored === null) {
      throw new DatasetUnavailableError(`The dataset object "${key}" is missing.`);
    }
    return stored;
  }

  async meta(): Promise<DatasetMeta> {
    return this.load<DatasetMeta>(KEYS.meta);
  }

  async models(): Promise<ModelRow[]> {
    const body = await this.load<{ origins: ModelRow[] }>(KEYS.models);
    return body.origins;
  }

  async recipes(): Promise<RecipeRow[]> {
    const body = await this.load<{ recipes: RecipeRow[] }>(KEYS.recipes);
    return body.recipes;
  }

  async repos(): Promise<RepoRow[]> {
    const body = await this.load<{ repos: RepoRow[] }>(KEYS.repos);
    return body.repos;
  }

  async stats(): Promise<StatsScope> {
    return this.load<StatsScope>(KEYS.stats);
  }

  async creators(): Promise<CreatorRow[]> {
    const body = await this.load<{ creators: CreatorRow[] }>(KEYS.creators);
    return body.creators;
  }

}

/** Drops every memoized family. Used by the tests. */
export function resetDatasetMemo(): void {
  memos = new WeakMap<object, Map<string, MemoEntry>>();
}
