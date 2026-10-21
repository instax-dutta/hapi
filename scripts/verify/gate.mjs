#!/usr/bin/env node
/**
 * One gate, one command, one success marker.
 *
 *   node scripts/verify/gate.mjs typecheck
 *   node scripts/verify/gate.mjs unit
 *   node scripts/verify/gate.mjs integration
 *   node scripts/verify/gate.mjs openapi
 *   node scripts/verify/gate.mjs dataset
 *   node scripts/verify/gate.mjs dox
 *   node scripts/verify/gate.mjs all
 *
 * Each mode runs its own check, prints a success-only marker after every
 * assertion passes, and exits nonzero the moment one fails. A gate that
 * cannot fail is a broken gate, so the marker is printed last and never on a
 * failure path.
 */
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const mode = process.argv[2];

function run(label, command, args) {
  process.stdout.write(`\n--- ${label} ---\n`);
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root });
  if (result.status !== 0) {
    console.error(`GATE FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

const gates = {
  typecheck: {
    marker: "TYPECHECK PASSED",
    run: () => {
      const result = spawnSync("npx", ["tsc", "--noEmit"], {
        stdio: "inherit",
        cwd: root,
      });
      if (result.status !== 0) {
        console.error("GATE FAILED: typecheck");
        process.exit(result.status ?? 1);
      }
    },
  },
  unit: {
    marker: "UNIT SUITE PASSED",
    run: () => run("unit suite", process.execPath, [join(root, "scripts", "verify", "test.mjs"), "test/unit"]),
  },
  integration: {
    marker: "INTEGRATION SUITE PASSED",
    run: () =>
      run("integration suite", process.execPath, [
        join(root, "scripts", "verify", "test.mjs"),
        "test/integration",
      ]),
  },
  openapi: {
    marker: "OPENAPI VERIFIED",
    run: () => run("openapi", process.execPath, [join(root, "scripts", "verify", "openapi.mjs")]),
  },
  dataset: {
    marker: "DATASET VERIFIED",
    run: () => run("dataset", process.execPath, [join(root, "scripts", "verify", "dataset.mjs")]),
  },
  dox: {
    marker: "DOX VERIFIED",
    run: () => run("dox", process.execPath, [join(root, "scripts", "verify", "dox.mjs")]),
  },
  crawl: {
    marker: "CRAWL PASSED",
    run: () => run("crawl", process.execPath, [join(root, "scripts", "verify", "crawl.mjs")]),
  },
  serve: {
    marker: "SERVE PASSED",
    run: () => run("serve", process.execPath, [join(root, "scripts", "verify", "serve.mjs")]),
  },
};

if (mode === "all") {
  for (const name of ["typecheck", "unit", "integration", "openapi", "dataset", "dox"]) {
    gates[name].run();
    console.log(gates[name].marker);
  }
  console.log("\nALL GATES PASSED");
  process.exit(0);
}

const gate = gates[mode];
if (!gate) {
  console.error(`unknown gate "${mode}". Known gates: ${Object.keys(gates).join(", ")}, all`);
  process.exit(2);
}

gate.run();
console.log(gate.marker);
