/**
 * The dataset store.
 *
 * The API reads a published dataset. It never writes one, and it never
 * computes one during a request.
 *
 * The interface is deliberately one method wide. Anything richer would tie the
 * request path to a particular backend, and the backend is still an open
 * decision.
 */

/** The subset of a Cloudflare R2 bucket this project uses. */
export interface R2BucketLike {
  get(key: string): Promise<{ text(): Promise<string>; httpEtag?: string } | null>;
}

/** One published dataset object, as the store holds it. */
export interface StoredObject {
  /** The raw bytes. */
  text: string;
  /** The store's own validator for the bytes. */
  etag: string;
}

export interface DatasetStore {
  /** One dataset object, or null when it does not exist. */
  get(key: string): Promise<StoredObject | null>;
}

export class DatasetUnavailableError extends Error {
  constructor(message = "The dataset is not available.") {
    super(message);
    this.name = "DatasetUnavailableError";
  }
}

/** Reads dataset objects from a Cloudflare R2 bucket. */
export class R2Store implements DatasetStore {
  private readonly bucket: R2BucketLike;

  constructor(bucket: R2BucketLike) {
    this.bucket = bucket;
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return { text: await object.text(), etag: object.httpEtag ?? "" };
  }
}

/**
 * A store that holds nothing.
 *
 * It exists so a missing binding produces a clean 503 rather than a crash
 * inside the handler.
 */
export class NullStore implements DatasetStore {
  async get(_key: string): Promise<StoredObject | null> {
    throw new DatasetUnavailableError(
      "No dataset store is configured. Bind an R2 bucket or set a data directory.",
    );
  }
}

/** The dataset object keys. One place, so the publisher and the API agree. */
export const KEYS = {
  meta: "meta.json",
  models: "models.json",
  recipes: "recipes.json",
  repos: "repos.json",
  stats: "stats.json",
  creators: "creators.json",
  dataset: "dataset.json",
} as const;
