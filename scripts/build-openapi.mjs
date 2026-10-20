#!/usr/bin/env node
/**
 * Generate `docs/openapi.json` from the spec module.
 *
 *   node scripts/build-openapi.mjs
 *
 * The module in `src/routes/openapi-spec.ts` is the source of truth. The
 * committed JSON is what the API serves and what a reader opens.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { openapiDocument } from "../src/routes/openapi-spec.ts";

const root = resolve(process.cwd());
const target = join(root, "docs", "openapi.json");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(openapiDocument, null, 2)}\n`);

console.log(`Wrote ${target}`);
