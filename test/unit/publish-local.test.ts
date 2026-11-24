import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishLocal } from "../../scripts/lib/publish-local.ts";
import { needsBuild, sourceSignature } from "../../scripts/lib/refresh-state.ts";

function staging(root: string, version: string, value: string): string {
  const dir = join(root, `stage-${version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ version }));
  writeFileSync(join(dir, "dataset.json"), value);
  return dir;
}

test("publication switches one symlink and keeps the previous version", () => {
  const root = mkdtempSync(join(tmpdir(), "hapi-publish-"));
  try {
    publishLocal(root, staging(root, "v1", "one"));
    const current = join(root, "current");
    assert.equal(readlinkSync(current), join("versions", "v1"));
    assert.equal(readFileSync(join(current, "dataset.json"), "utf8"), "one");

    publishLocal(root, staging(root, "v2", "two"));
    assert.equal(readlinkSync(current), join("versions", "v2"));
    assert.equal(readFileSync(join(current, "dataset.json"), "utf8"), "two");
    assert.ok(existsSync(join(root, "versions", "v1")), "the previous version was pruned too early");

    publishLocal(root, staging(root, "v3", "three"));
    assert.equal(readlinkSync(current), join("versions", "v3"));
    assert.ok(!existsSync(join(root, "versions", "v1")), "older versions are not pruned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a changed raw source or code produces a different signature", () => {
  const root = mkdtempSync(join(tmpdir(), "hapi-refresh-state-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "scripts", "lib"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "package.json"), "{}");
    const raw = JSON.stringify({ repos: [1] });
    const first = sourceSignature(root, raw);
    assert.equal(sourceSignature(root, raw), first);
    assert.notEqual(sourceSignature(root, JSON.stringify({ repos: [2] })), first);

    writeFileSync(join(root, "src", "a.ts"), "export const a = 2;\n");
    assert.notEqual(sourceSignature(root, raw), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a build runs only when the source signature or the published version changed", () => {
  assert.equal(needsBuild(null, "abc"), true);
  assert.equal(needsBuild("abc", "abc"), false);
  assert.equal(needsBuild("old", "abc"), true);
});
