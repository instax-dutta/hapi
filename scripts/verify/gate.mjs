#!/usr/bin/env node
/**
 * The gate runner.
 *
 *   node scripts/verify/gate.mjs <mode>   run one gate
 *   node scripts/verify/gate.mjs all      run the offline gates
 *   node scripts/verify/gate.mjs ledger   run every gate in GATES.md
 *
 * Each mode runs its own check, prints a success-only marker after every
 * assertion passes, and exits nonzero the moment one fails. A gate that
 * cannot fail is a broken gate, so the marker is printed last and never on a
 * failure path.
 *
 * The `ledger` mode reads `GATES.md` and runs the commands it declares, so
 * the ledger is the single source of truth and a gate added to it is a gate
 * that runs. The aggregate gate is skipped, because it is this script.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());

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
    run: () =>
      run("unit suite", process.execPath, [
        join(root, "scripts", "verify", "test.mjs"),
        "test/unit",
      ]),
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
    run: () =>
      run("openapi", process.execPath, [join(root, "scripts", "verify", "openapi.mjs")]),
  },
  dataset: {
    marker: "DATASET VERIFIED",
    run: () =>
      run("dataset", process.execPath, [join(root, "scripts", "verify", "dataset.mjs")]),
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

/** The gates that need no network and no server. */
const OFFLINE = ["typecheck", "unit", "integration", "openapi", "dataset", "dox"];

/**
 * Read the ledger.
 *
 * A gate is a `- [x] ID: title` line with an indented `CHECK:` and an
 * indented `EXPECT:` beneath it. A gate with no command is a manual gate and
 * is not run.
 */
function readLedger() {
  const text = readFileSync(join(root, "GATES.md"), "utf8");
  const declared = [];
  const pattern = /^- \[[ x]\]\s+(\S+):\s*(.*)$/gm;
  const heads = [...text.matchAll(pattern)];

  for (let index = 0; index < heads.length; index += 1) {
    const head = heads[index];
    const body = text.slice(
      head.index + head[0].length,
      index + 1 < heads.length ? heads[index + 1].index : text.length,
    );
    const check = body.match(/^\s+CHECK:\s*(.+)$/m);
    const expect = body.match(/^\s+EXPECT:\s*(.+)$/m);
    if (!check || !expect) continue;
    declared.push({
      id: head[1],
      title: head[2].trim(),
      check: check[1].trim(),
      expect: expect[1].trim(),
    });
  }
  return declared;
}

function runLedger() {
  const declared = readLedger();
  if (declared.length === 0) {
    console.error("GATES.md declares no runnable gate.");
    process.exit(1);
  }

  const failed = [];
  for (const gate of declared) {
    // The aggregate gate is this script, so running it here would recurse.
    if (gate.check.includes("gate.mjs ledger")) continue;

    process.stdout.write(`\n=== ${gate.id}: ${gate.title} ===\n`);
    const result = spawnSync(gate.check, {
      shell: true,
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    process.stdout.write(output);

    if (result.status !== 0) {
      failed.push(`${gate.id} (exit ${result.status})`);
      continue;
    }
    if (!output.includes(gate.expect)) {
      failed.push(`${gate.id} (the output did not carry "${gate.expect}")`);
    }
  }

  if (failed.length > 0) {
    console.error(`\nGATES FAILED: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`\nALL GATES PASSED: ${declared.length} declared in GATES.md`);
}

const mode = process.argv[2] ?? "ledger";

if (mode === "ledger") {
  runLedger();
  process.exit(0);
}

if (mode === "all") {
  for (const name of OFFLINE) {
    gates[name].run();
    console.log(gates[name].marker);
  }
  console.log("\nALL GATES PASSED");
  process.exit(0);
}

const gate = gates[mode];
if (!gate) {
  console.error(
    `unknown gate "${mode}". Known gates: ${Object.keys(gates).join(", ")}, all, ledger`,
  );
  process.exit(2);
}

gate.run();
console.log(gate.marker);
