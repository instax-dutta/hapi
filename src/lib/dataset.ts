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

/**
 * How long a memoized family is served before it is read again.
 *
 * The default suits a Worker isolate, where the dataset updates every two
 * hours and memory is tight. The Node entry extends the window and refreshes
 * behind the response.
 */
const DEFAULT_TTL_MS = 30_000;

/** How many families are kept parsed at once by default. */
const DEFAULT_MAX_FAMILIES = 2;

export interface DatasetLoaderOptions {
  /** How long a parsed family is served before it is read again. */
  ttlMs?: number;
  /** How many parsed families the memo keeps. */
  maxFamilies?: number;
  /**
   * Serve a stale family immediately and refresh it behind the response.
   * Off by default: a Worker may not keep the promise alive.
   */
  background?: boolean;
}

interface MemoEntry {
  value: unknown;
  at: number;
}

/**
 * The memo is keyed by the store instance, so a test that swaps the store
 * never reads a stale family from a previous one.
 */
let memos = new WeakMap<object, Map<string, MemoEntry>>();

/** One in-flight read per family, shared by every concurrent caller. */
let inflight = new WeakMap<object, Map<string, Promise<MemoEntry>>>();

export class DatasetLoader {
  private readonly store: DatasetStore;
  private readonly ttlMs: number;
  private readonly maxFamilies: number;
  private readonly background: boolean;

  constructor(store: DatasetStore, options: DatasetLoaderOptions = {}) {
    this.store = store;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxFamilies = options.maxFamilies ?? DEFAULT_MAX_FAMILIES;
    this.background = options.background ?? false;
  }

  /** Read and parse one family from the store. */
  private async read<T>(key: string): Promise<MemoEntry> {
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

    return { value, at: Date.now() };
  }

  /**
   * Refresh one family.
   *
   * Concurrent callers share one read, so a burst never parses the same
   * family twice. The in-flight entry is cleared when the read settles,
   * including on failure, so the next caller retries instead of joining a
   * dead promise.
   */
  private refresh(key: string): Promise<MemoEntry> {
    const storeKey = this.store as unknown as object;
    let pendingByKey = inflight.get(storeKey);
    if (!pendingByKey) {
      pendingByKey = new Map<string, Promise<MemoEntry>>();
      inflight.set(storeKey, pendingByKey);
    }

    const pending = pendingByKey.get(key);
    if (pending) return pending;

    const promise = this.read(key)
      .then((entry) => {
        let perStore = memos.get(storeKey);
        if (!perStore) {
          perStore = new Map<string, MemoEntry>();
          memos.set(storeKey, perStore);
        }
        perStore.delete(key);
        perStore.set(key, entry);
        while (perStore.size > this.maxFamilies) {
          const oldest = perStore.keys().next();
          if (oldest.done) break;
          perStore.delete(oldest.value);
        }
        return entry;
      })
      .finally(() => {
        pendingByKey.delete(key);
      });

    pendingByKey.set(key, promise);
    return promise;
  }

  private async load<T>(key: string): Promise<T> {
    const storeKey = this.store as unknown as object;
    const perStore = memos.get(storeKey);
    const hit = perStore?.get(key);

    if (hit && perStore) {
      // Keep the most recently used family at the end of the map.
      perStore.delete(key);
      perStore.set(key, hit);
      if (Date.now() - hit.at >= this.ttlMs) {
        if (this.background) {
          // Serve the stale copy now and refresh behind the response. A
          // failed refresh keeps the stale copy, so an outage never empties
          // the API.
          void this.refresh(key).catch(() => {});
        } else {
          // The store may fail; the stale copy is still better than a 503.
          try {
            const entry = await this.refresh(key);
            return entry.value as T;
          } catch {
            return hit.value as T;
          }
        }
      }
      return hit.value as T;
    }

    const entry = await this.refresh(key);
    return entry.value as T;
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

/** Drops every memoized family and in-flight read. Used by the tests. */
export function resetDatasetMemo(): void {
  memos = new WeakMap<object, Map<string, MemoEntry>>();
  inflight = new WeakMap<object, Map<string, Promise<MemoEntry>>>();
}
