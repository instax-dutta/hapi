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
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

export interface DatasetStore {
  /** The raw bytes of one dataset object, or null when it does not exist. */
  get(key: string): Promise<string | null>;
}

export class DatasetUnavailableError extends Error {
  constructor(message = "The dataset is not available.") {
    super(message);
    this.name = "DatasetUnavailableError";
  }
}

/** Reads dataset objects from a Cloudflare R2 bucket. */
export class R2Store implements DatasetStore {
  constructor(private readonly bucket: R2BucketLike) {}

  async get(key: string): Promise<string | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return object.text();
  }
}

/**
 * A store that holds nothing.
 *
 * It exists so a missing binding produces a clean 503 rather than a crash
 * inside the handler.
 */
export class NullStore implements DatasetStore {
  async get(_key: string): Promise<string | null> {
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
