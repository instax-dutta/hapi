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
import { KEYS, type DatasetStore } from "./store.ts";

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

export interface DatasetFamilies {
  meta: DatasetMeta;
  models: ModelRow[];
  recipes: RecipeRow[];
  repos: RepoRow[];
  stats: StatsScope;
  creators: CreatorRow[];
}

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
      return hit.value as T;
    }

    const raw = await this.store.get(key);
    if (raw === null) {
      throw new Error(`The dataset object "${key}" is missing.`);
    }
    const value = JSON.parse(raw) as T;
    perStore.set(key, { value, at: now });
    return value;
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

  /** The whole dataset in one document, for bulk consumers. */
  async dataset(): Promise<{
    meta: DatasetMeta;
    models: ModelRow[];
    recipes: RecipeRow[];
    repos: RepoRow[];
    creators: CreatorRow[];
  }> {
    return this.load(KEYS.dataset);
  }
}

/** Drops every memoized family. Used by the tests. */
export function resetDatasetMemo(): void {
  memos = new WeakMap<object, Map<string, MemoEntry>>();
}
