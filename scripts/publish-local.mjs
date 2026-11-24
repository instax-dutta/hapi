#!/usr/bin/env node
/**
 * Publish a staging build behind the `data/current` symlink.
 *
 * The API points its data directory at that symlink, so this is the only
 * write that makes new data visible. It is atomic and keeps one rollback.
 */
import { resolve } from "node:path";
import { publishLocal } from "./lib/publish-local.ts";

const root = resolve(process.cwd());
const staging = resolve(root, process.argv[2] ?? "data/staging");
const version = publishLocal(root, staging);
console.log(`Published ${version} at ${root}/data/current`);
