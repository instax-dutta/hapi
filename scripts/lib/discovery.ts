/**
 * A discovery that found nothing is a broken crawl, not an empty ecosystem.
 *
 * Writing it to `raw.json` would let the build refuse to publish, but it would
 * also destroy the previous good raw file. Refuse before touching it.
 */
export function assertDiscovery(models: readonly unknown[]): void {
  if (models.length === 0) {
    throw new Error("Discovery found no models. The Hub or the token is broken; the existing raw.json is kept.");
  }
}
