#!/usr/bin/env node
import path from "node:path";
import { checkArtifacts, refreshSource, writeArtifacts } from "./core.mjs";

function usage() {
  return [
    "Snake S1 deterministic asset/catalog tool",
    "",
    "  node tools/snake-s1-assets/cli.mjs --refresh-source --source <approved archive>",
    "  node tools/snake-s1-assets/cli.mjs --write",
    "  node tools/snake-s1-assets/cli.mjs --check",
    "",
    "Only --refresh-source may read the external approved archive. --write and --check are repo-only.",
  ].join("\n");
}

function parse(argv) {
  const options = { mode: null, source: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--refresh-source", "--write", "--check"].includes(value)) {
      if (options.mode) throw new Error("choose exactly one mode");
      options.mode = value;
    } else if (value === "--source") {
      options.source = argv[++index];
      if (!options.source) throw new Error("--source requires a path");
    } else if (value === "--help" || value === "-h") {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`unknown argument: ${value}`);
  }
  if (!options.mode) throw new Error("a mode is required");
  if (options.mode === "--refresh-source" && !options.source) throw new Error("--refresh-source requires --source");
  if (options.mode !== "--refresh-source" && options.source) throw new Error("--source is accepted only with --refresh-source");
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.mode === "--refresh-source") {
    const source = path.resolve(options.source);
    const manifest = refreshSource(source);
    const result = writeArtifacts();
    console.log(`[snake-s1] refreshed ${manifest.sourceFiles.length} frozen source files and wrote ${result.artifactCount} artifacts`);
  } else if (options.mode === "--write") {
    const result = writeArtifacts();
    console.log(`[snake-s1] wrote ${result.artifactCount} deterministic artifacts`);
  } else {
    const result = checkArtifacts();
    console.log(`[snake-s1] check passed (${result.artifactCount} deterministic artifacts)`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(`\n${usage()}`);
  process.exitCode = 1;
}
