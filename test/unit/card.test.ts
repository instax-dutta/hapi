import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCard } from "../../src/core/card.ts";
import { parseTables, parseNumber, parseRefusal, stripCell, proseLines } from "../../src/core/markdown.ts";
import {
  detectFormats,
  familyFor,
  parseParams,
  quantLabel,
  sizeClassFor,
} from "../../src/core/naming.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "cards");

function card(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

test("a table is recognised and its rows are read", () => {
  const tables = parseTables("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["A", "B"]);
  assert.deepEqual(tables[0].rows, [["1", "2"]]);
});

test("a table inside a fenced code block is not a table", () => {
  const tables = parseTables("```\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```\n");
  assert.equal(tables.length, 0);
});

test("a cell loses its markup", () => {
  assert.equal(stripCell("**0.16**"), "0.16");
  assert.equal(stripCell("[label](https://example.com)"), "label");
  assert.equal(stripCell("&amp;"), "&");
});

test("a number is read out of a messy cell", () => {
  assert.equal(parseNumber("**0.0801**"), 0.0801);
  assert.equal(parseNumber("82.01%"), 82.01);
  assert.equal(parseNumber("none"), null);
  assert.equal(parseNumber(undefined), null);
});

test("a refusal is read as a count over a total", () => {
  assert.deepEqual(parseRefusal("3/100"), { count: 3, total: 100 });
  assert.deepEqual(parseRefusal("3 out of 100"), { count: 3, total: 100 });
  assert.equal(parseRefusal("3"), null);
  assert.equal(parseRefusal("0/0"), null);
});

test("prose lines skip fenced code", () => {
  const lines = proseLines("one\n```\ntwo\n```\nthree");
  assert.deepEqual(
    lines.map((line) => line.text),
    ["one", "three"],
  );
});

test("the heretic card publishes a divergence and a refusal count", () => {
  const parsed = parseCard(card("p-e-w__gemma-3-12b-it-heretic.md"), {
    selfId: "p-e-w/gemma-3-12b-it-heretic",
  });
  assert.equal(parsed.metrics.kl, 0.16);
  assert.equal(parsed.metrics.refusals, 3);
  assert.equal(parsed.metrics.refusalTotal, 100);
  assert.equal(parsed.metrics.originalRefusals, 97);
  assert.equal(parsed.metrics.originalRefusalTotal, 100);
  assert.equal(parsed.metrics.confidence, "medium");
  assert.equal(parsed.hereticVersion, "1.0.0");
  assert.equal(parsed.isHereticConversion, true);
  assert.equal(parsed.referencesHereticProject, true);
});

test("the heretic card names the base model it came from", () => {
  const parsed = parseCard(card("p-e-w__gemma-3-12b-it-heretic.md"), {
    selfId: "p-e-w/gemma-3-12b-it-heretic",
  });
  assert.ok(parsed.baseModelIds.includes("google/gemma-3-12b-it"));
  assert.ok(parsed.baseModelIds.includes("google/gemma-3-12b-pt"));
  assert.equal(parsed.baseModelEvidence, "title");
});

test("a card with no metrics yields no metric at all", () => {
  const parsed = parseCard("# Nothing here\n\nNo numbers in this card.\n", { selfId: "a/b" });
  assert.equal(parsed.metrics.kl, null);
  assert.equal(parsed.metrics.refusals, null);
  assert.equal(parsed.metrics.confidence, "none");
  assert.equal(parsed.metrics.evidence, null);
});

test("a card that resolves to itself does not list itself as a base", () => {
  const parsed = parseCard(
    "# A decensored version of [a/b](https://huggingface.co/a/b), made using [Heretic](https://github.com/p-e-w/heretic)\n",
    { selfId: "a/b" },
  );
  assert.equal(parsed.baseModelIds.includes("a/b"), false);
});

test("a card without the project link is not a conversion", () => {
  const parsed = parseCard("# Just a model\n", { selfId: "a/b" });
  assert.equal(parsed.referencesHereticProject, false);
  assert.equal(parsed.isHereticConversion, false);
});

test("every real card fixture parses without throwing", () => {
  const names = [
    "DavidAU__Llama-3.2-3B-Instruct-heretic-ablitered-uncensored.md",
    "DreamFast__gemma-3-12b-it-heretic-v2.md",
    "froggeric__Qwen3.6-35B-A3B-Uncensored-Heretic-MLX-4bit.md",
    "maternion__MiniCPM-V-4.7-1B-Heretic-Abliterated-GGUF.md",
    "mradermacher__Qwen3.8-9B-heretic-uncensored-GGUF.md",
    "p-e-w__Qwen3-4B-Instruct-2507-heretic-v4.md",
    "richardyoung__Olmo-3-7B-Think-heretic.md",
    "synthetic__noise.md",
    "zaakirio__gemma-4-12b-it-uncensored-GGUF.md",
  ];
  for (const name of names) {
    const parsed = parseCard(card(name), { selfId: "someone/something" });
    assert.ok(parsed.metrics.confidence, `${name} should carry a confidence`);
  }
});

test("parameter counts are read from dense, moe and effective names", () => {
  assert.equal(parseParams("gemma-3-12b-it").totalB, 12);
  assert.equal(parseParams("Qwen3-30B-A3B").totalB, 30);
  assert.equal(parseParams("Qwen3-30B-A3B").activeB, 3);
  assert.equal(parseParams("Qwen3-30B-A3B").moe, true);
  assert.equal(parseParams("gemma-3-4b-it-E2B").totalB, 2);
  assert.equal(parseParams("mixtral-8x7b").totalB, 56);
  assert.equal(parseParams("mixtral-8x7b").moe, true);
  assert.equal(parseParams("no-size-here").totalB, null);
});

test("a size class follows the parameter count", () => {
  assert.equal(sizeClassFor(0.5), "sub-1b");
  assert.equal(sizeClassFor(3), "1-4b");
  assert.equal(sizeClassFor(12), "9-15b");
  assert.equal(sizeClassFor(70), "70b-plus");
  assert.equal(sizeClassFor(null), "unknown");
});

test("a family is recognised from the model name", () => {
  assert.equal(familyFor("google/gemma-3-12b-it").slug, "gemma-3");
  assert.equal(familyFor("Qwen/Qwen3-32B").slug, "qwen-3");
  assert.equal(familyFor("meta-llama/Llama-3.2-3B-Instruct").slug, "llama-3-2");
});

test("a quantisation label is read from a file name", () => {
  assert.equal(quantLabel("gemma-3-12b-it-Q4_K_M.gguf"), "Q4_K_M");
  assert.equal(quantLabel("model-bf16"), "BF16");
  assert.equal(quantLabel("model"), null);
});

test("formats are detected from files and tags", () => {
  assert.deepEqual(detectFormats({ name: "a/b", tags: [], files: ["model.gguf"] }), ["gguf"]);
  assert.deepEqual(detectFormats({ name: "a/b", tags: ["mlx"], files: [] }), ["mlx"]);
  assert.deepEqual(detectFormats({ name: "a/b", tags: [], files: [] }), ["other"]);
});
