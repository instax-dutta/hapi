/**
 * Crawl the Hugging Face Hub and write `data/raw.json`.
 *
 * Incremental: a repository whose `sha` has not changed reuses its cached
 * parse, so a refresh only fetches new or edited READMEs.
 *
 *   node scripts/crawl.ts --limit 300          # dev sample
 *   node scripts/crawl.ts --concurrency 12     # be gentle
 *   node scripts/crawl.ts --refresh            # ignore the cache
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { discoverHereticModels, fetchReadme, toRawRepo, type HFRawModel } from "../src/lib/hf.ts";
import { mapLimit } from "./lib/pool.ts";
import { loadCard, type CardCacheEntry } from "./lib/incremental.ts";
import { parseCard } from "../src/core/card.ts";
import type { ParsedCard, RawRepo } from "../src/core/types.ts";

interface RawFile {
  crawledAt: string;
  discovery: { tagged: number; named: number };
  repos: Array<RawRepo & { discoveredBy: "tag" | "name"; hasReadme: boolean }>;
  cards: Record<string, ParsedCard | null>;
}

const ROOT = process.cwd();
const RAW_PATH = join(ROOT, "data", "raw.json");
const CACHE_DIR = join(ROOT, "data", "cache", "cards");

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function cachePath(id: string): string {
  return join(CACHE_DIR, `${id.replace(/[^A-Za-z0-9_.-]+/g, "__")}.json`);
}

function readCache(id: string): CardCacheEntry | null {
  const path = cachePath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CardCacheEntry;
  } catch {
    return null;
  }
}

function writeCache(id: string, value: CardCacheEntry): void {
  mkdirSync(dirname(cachePath(id)), { recursive: true });
  writeFileSync(cachePath(id), JSON.stringify(value));
}

async function main(): Promise<void> {
  const limit = Number(arg("limit", "0"));
  const concurrency = Number(arg("concurrency", "10"));
  const refresh = flag("refresh");
  const token = process.env.HF_TOKEN;
  const outPath = arg("out", RAW_PATH);
  const rawPath = outPath.startsWith("/") ? outPath : join(ROOT, outPath);

  console.log("Discovering Heretic models (tag pass, then name pass)…");
  const discovery = await discoverHereticModels({
    token,
    onPage: (count) => process.stdout.write(`  ${count} models\r`),
  });
  process.stdout.write("\n");

  let models: HFRawModel[] = discovery.merged;
  if (limit > 0) models = models.slice(0, limit);
  console.log(
    `Discovered ${discovery.tagged.length} tagged + ${discovery.named.length} named = ${discovery.merged.length} unique; enriching ${models.length}`,
  );

  // Anonymous Hub access is rate limited hard, and a 429 during the crawl drops
  // every repository whose README failed, which silently shrinks the index.
  if (!token) {
    console.warn(
      "  ! HF_TOKEN is not set. The Hub will rate-limit this crawl and repos whose\n" +
        "    README fails are dropped from the index. Set the HF_TOKEN secret.",
    );
  }

  let reused = 0;
  let fetched = 0;
  let errors = 0;
  let done = 0;
  const cards: Record<string, ParsedCard | null> = {};
  const repos: RawFile["repos"] = [];

  await mapLimit(models, Number.isFinite(concurrency) ? concurrency : 10, async (model, index) => {
    const raw = toRawRepo(model);
    const cached = refresh ? null : readCache(raw.id);
    let card: ParsedCard | null = null;

    try {
      const result = await loadCard(
        raw,
        cached,
        (id) => fetchReadme(id, { token }),
        (markdown, options) =>
          parseCard(markdown, {
            selfId: options.selfId,
            declaredBaseModels: raw.declaredBaseModels,
          }),
      );
      card = result.card;
      if (result.fetched) {
        writeCache(raw.id, result.entry);
        fetched += 1;
      } else {
        reused += 1;
      }
    } catch (error) {
      // Leave the previous cache entry in place so a transient failure does not
      // turn a parsed repo into a missing one on the next run.
      errors += 1;
      console.warn(`\n  ! ${raw.id}: ${(error as Error).message}`);
      card = cached?.card ?? null;
    }
    cards[raw.id] = card;
    repos[index] = {
      ...raw,
      discoveredBy: model.discoveredBy,
      hasReadme: card !== null,
    };

    // Workers finish out of order, so count completions rather than positions.
    done += 1;
    if (done % 100 === 0 || done === models.length) {
      process.stdout.write(
        `  ${done}/${models.length} repos (${fetched} fetched, ${reused} cached, ${errors} failed)\r`,
      );
    }
  });
  process.stdout.write("\n");

  const output: RawFile = {
    crawledAt: new Date().toISOString(),
    discovery: { tagged: discovery.tagged.length, named: discovery.named.length },
    repos: repos.filter(Boolean),
    cards,
  };

  mkdirSync(dirname(rawPath), { recursive: true });
  const tmp = `${rawPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(output));
  renameSync(tmp, rawPath);
  console.log(`Wrote ${rawPath} (${output.repos.length} repos, ${errors} fetch errors)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
