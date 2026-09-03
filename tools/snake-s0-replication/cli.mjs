#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareDirectories, stableJson } from "./core.mjs";
import { buildEvidence } from "./build.mjs";

function usage() {
  return `Usage:
  node tools/snake-s0-replication/cli.mjs --source <locked-archive> --write
  node tools/snake-s0-replication/cli.mjs --source <locked-archive> --check
`;
}

function parseArgs(argv) {
  const result = { source: null, mode: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") {
      if (index + 1 >= argv.length) throw new Error("--source requires a path");
      result.source = argv[++index];
    } else if (argument === "--write" || argument === "--check") {
      const mode = argument.slice(2);
      if (result.mode && result.mode !== mode) throw new Error("Choose exactly one of --write or --check");
      result.mode = mode;
    } else if (argument === "--help" || argument === "-h") result.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function exactOutputPath(targetRoot) {
  const output = path.resolve(targetRoot, "docs/s/evidence/s0");
  const expected = path.join(path.resolve(targetRoot), "docs", "s", "evidence", "s0");
  if (output !== expected) throw new Error(`Refusing unexpected output path: ${output}`);
  return output;
}

function replaceOutput(output, built) {
  const parent = path.dirname(output);
  const backup = path.join(parent, `.s0-backup-${process.pid}`);
  if (fs.existsSync(backup)) throw new Error(`Refusing existing backup path: ${backup}`);
  let movedOld = false;
  try {
    if (fs.existsSync(output)) {
      fs.renameSync(output, backup);
      movedOld = true;
    }
    fs.renameSync(built, output);
    if (movedOld) fs.rmSync(backup, { recursive: true });
  } catch (error) {
    if (!fs.existsSync(output) && movedOld && fs.existsSync(backup)) fs.renameSync(backup, output);
    throw error;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.source || !args.mode) throw new Error(usage().trim());
  const targetRoot = process.cwd();
  if (!fs.existsSync(path.join(targetRoot, "docs/s/s0-replication-baseline.md"))) {
    throw new Error("Run this command from the gameStarterKit repository root");
  }
  const sourceRoot = fs.realpathSync(args.source);
  const output = exactOutputPath(targetRoot);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(path.dirname(output), ".s0-build-"));
  const built = path.join(temporaryRoot, "s0");
  try {
    const report = buildEvidence({ sourceRoot, targetRoot, outputRoot: built });
    if (args.mode === "check") {
      if (!fs.existsSync(output)) throw new Error(`No checked-in evidence bundle at ${output}`);
      const comparison = compareDirectories(output, built);
      process.stdout.write(stableJson({ mode: "check", byteForByte: true, ...report, ...comparison }));
    } else {
      replaceOutput(output, built);
      process.stdout.write(stableJson({ mode: "write", output: "docs/s/evidence/s0", ...report }));
    }
  } finally {
    if (fs.existsSync(temporaryRoot)) fs.rmSync(temporaryRoot, { recursive: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
