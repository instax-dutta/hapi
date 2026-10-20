import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareNullable,
  compareText,
  defaultDirFor,
  matchesText,
  parseQuery,
  runQuery,
  verificationFirst,
} from "../../src/lib/query.ts";

const SORTS = ["score", "kl", "downloads"] as const;

test("an unknown sort key falls back to the default", () => {
  const query = parseQuery(new URLSearchParams("sort=bogus"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  assert.equal(query.sort, "score");
});

test("an unknown direction falls back to the default for the sort", () => {
  const query = parseQuery(new URLSearchParams("sort=kl&dir=sideways"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  assert.equal(query.dir, "asc");
  assert.equal(defaultDirFor("score"), "desc");
});

test("the page size is one of the published options", () => {
  const query = parseQuery(new URLSearchParams("perPage=37"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  assert.equal(query.perPage, 50);
  const big = parseQuery(new URLSearchParams("perPage=200"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  assert.equal(big.perPage, 200);
});

test("a negative page is clamped to the first page", () => {
  const query = parseQuery(new URLSearchParams("page=-4"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  assert.equal(query.page, 1);
});

test("a missing value sorts last in both directions", () => {
  assert.equal(compareNullable(null, 5, "asc"), 1);
  assert.equal(compareNullable(null, 5, "desc"), 1);
  assert.equal(compareNullable(5, null, "asc"), -1);
  assert.equal(compareNullable(null, null, "desc"), 0);
  assert.equal(compareNullable(1, 2, "asc"), -1);
  assert.equal(compareNullable(1, 2, "desc"), 1);
});

test("text compares in the requested direction", () => {
  assert.equal(compareText("a", "b", "asc"), -1);
  assert.equal(compareText("a", "b", "desc"), 1);
});

test("the text match is case-insensitive", () => {
  assert.equal(matchesText("Gemma 3", "gemma"), true);
  assert.equal(matchesText("Gemma 3", "llama"), false);
  assert.equal(matchesText("Gemma 3", ""), true);
});

test("the corroborated rows come first whatever the sort", () => {
  const rows = [
    { id: "a", verified: false, value: 100 },
    { id: "b", verified: true, value: 1 },
  ];
  const compare = verificationFirst(
    (row: (typeof rows)[number]) => row.verified,
    (a: (typeof rows)[number], b: (typeof rows)[number]) => a.value - b.value,
  );
  const ordered = [...rows].sort(compare);
  assert.equal(ordered[0].id, "b");
});

test("a page past the end returns the last page, not an empty one", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ id: String(index) }));
  const query = parseQuery(new URLSearchParams("page=99&perPage=25"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  const result = runQuery(rows, query, () => true, { score: (a, b) => a.id.localeCompare(b.id) });
  assert.equal(result.pageCount, 1);
  assert.equal(result.page, 1);
  assert.equal(result.rows.length, 7);
});

test("the result reports the total before pagination", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: String(index) }));
  const query = parseQuery(new URLSearchParams("perPage=25"), {
    sorts: SORTS,
    defaultSort: "score",
  });
  const result = runQuery(rows, query, () => true, { score: (a, b) => a.id.localeCompare(b.id) });
  assert.equal(result.total, 30);
  assert.equal(result.pageCount, 2);
  assert.equal(result.rows.length, 25);
});
