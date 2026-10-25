import { test } from "node:test";
import assert from "node:assert/strict";
import { DatasetLoader } from "../../src/lib/dataset.ts";
import { KEYS, type DatasetStore, type StoredObject } from "../../src/lib/store.ts";

/** A store whose reads the test can hold, release or fail. */
class ScriptedStore implements DatasetStore {
  readonly reads: string[] = [];
  objects: Record<string, string> = {};
  hold: Promise<void> | null = null;
  fail = false;

  async get(key: string): Promise<StoredObject | null> {
    this.reads.push(key);
    if (this.hold) await this.hold;
    if (this.fail) throw new Error("store is down");
    const value = this.objects[key];
    if (value === undefined) return null;
    return { text: value, etag: `"${value.length.toString(16)}"` };
  }
}

function meta(version: string): string {
  return JSON.stringify({ version });
}

test("a warm family is not read again inside the TTL", async () => {
  const store = new ScriptedStore();
  store.objects[KEYS.meta] = meta("1");
  const loader = new DatasetLoader(store, { ttlMs: 10_000 });

  assert.equal((await loader.meta()).version, "1");
  assert.equal((await loader.meta()).version, "1");
  assert.equal(store.reads.length, 1);
});

test("concurrent cold reads share one store read", async () => {
  const store = new ScriptedStore();
  store.objects[KEYS.meta] = meta("1");
  let release: () => void = () => {};
  store.hold = new Promise<void>((resolve) => {
    release = resolve;
  });

  const loader = new DatasetLoader(store, { ttlMs: 10_000 });
  const first = loader.meta();
  const second = loader.meta();
  assert.equal(store.reads.length, 1);

  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.version, "1");
  assert.equal(b.version, "1");
  assert.equal(store.reads.length, 1);
});

test("an expired family is served stale while the refresh runs", async () => {
  const store = new ScriptedStore();
  store.objects[KEYS.meta] = meta("1");
  const loader = new DatasetLoader(store, { ttlMs: 0, background: true });

  assert.equal((await loader.meta()).version, "1");

  store.objects[KEYS.meta] = meta("2");
  let release: () => void = () => {};
  store.hold = new Promise<void>((resolve) => {
    release = resolve;
  });

  // The stale copy is returned without waiting for the held read.
  const stale = await loader.meta();
  assert.equal(stale.version, "1");
  assert.equal(store.reads.length, 2);

  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  store.hold = null;

  assert.equal(store.reads.length, 2);
  assert.equal((await loader.meta()).version, "2");
});

test("a failed refresh keeps the stale family", async () => {
  const store = new ScriptedStore();
  store.objects[KEYS.meta] = meta("1");
  const loader = new DatasetLoader(store, { ttlMs: 0, background: true });

  assert.equal((await loader.meta()).version, "1");

  store.fail = true;
  // The failed background refresh is swallowed; the caller keeps the data.
  assert.equal((await loader.meta()).version, "1");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await loader.meta()).version, "1");
});

test("a missing family still fails the request", async () => {
  const store = new ScriptedStore();
  const loader = new DatasetLoader(store, { ttlMs: 10_000 });

  await assert.rejects(() => loader.meta(), /missing/);
});
