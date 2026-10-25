/**
 * A fixed-window rate limiter.
 *
 * It exists for the public Node deployment, where one scraper on a single
 * event loop can starve every other client. It is deliberately tiny: a map
 * of windows per client, no timers, no dependencies. A limit of zero
 * disables it, which is what a private deployment wants.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets. Zero when the request is allowed. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Above this many tracked clients, expired windows are swept eagerly. */
const SWEEP_THRESHOLD = 10_000;

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, Window>();

  constructor(limit: number, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Count one request for a client.
   *
   * `now` is injectable so the test can move the clock without sleeping.
   */
  take(client: string, now = Date.now()): RateLimitDecision {
    if (this.limit <= 0) return { allowed: true, retryAfterSeconds: 0 };

    let window = this.windows.get(client);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(client, window);
      if (this.windows.size > SWEEP_THRESHOLD) this.sweep(now);
    }

    window.count += 1;
    if (window.count <= this.limit) return { allowed: true, retryAfterSeconds: 0 };

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  private sweep(now: number): void {
    for (const [client, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(client);
    }
  }
}
