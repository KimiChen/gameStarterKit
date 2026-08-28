#!/usr/bin/env node
/**
 * Verify the checked-in client performance baseline.
 *
 * The artifact is intentionally a structural/deterministic contract.  This
 * verifier reruns the headless probe with the artifact workload and compares
 * only checksums, command counts and allocation estimates.  Timing summaries,
 * heap deltas and runtime metadata are observations and are never a gate.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ARTIFACT = path.join(ROOT, "docs", "perf", "client-ballMove-baseline.json");
const TOOL = path.join(ROOT, "tools", "client-perf-baseline.ts");
const SCHEMA_VERSION = 1;
const BENCHMARK = "client-ballMove";
const MAX_INTEGER = 10_000;
const MAX_UINT32 = 0xffff_ffff;
const MAX_INPUT_VALUES = 25_000_000;
const MAX_CHILD_OUTPUT = 16 * 1024 * 1024;

function parseArgs(argv) {
  let artifact = DEFAULT_ARTIFACT;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact") {
      if (index + 1 >= argv.length) throw new Error("--artifact 需要文件参数");
      artifact = path.resolve(process.cwd(), argv[++index]);
    } else if (arg.startsWith("--artifact=")) {
      const value = arg.slice("--artifact=".length);
      if (!value) throw new Error("--artifact 需要文件参数");
      artifact = path.resolve(process.cwd(), value);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("用法：node scripts/verify-perf-baseline.mjs [--artifact <file>] [--json]");
      return { help: true };
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return { artifact, json, help: false };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} 必须是 object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    const unexpected = actual.filter((key) => !wanted.includes(key));
    const missing = wanted.filter((key) => !actual.includes(key));
    const detail = [
      missing.length ? `缺少 ${missing.join(",")}` : "",
      unexpected.length ? `未知 ${unexpected.join(",")}` : "",
    ].filter(Boolean).join("；");
    errors.push(`${label} 字段不匹配（${detail}）`);
    return false;
  }
  return true;
}

function safePositiveInteger(value, label, errors) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INTEGER) {
    errors.push(`${label} 必须是 1-${MAX_INTEGER} 的整数`);
    return false;
  }
  return true;
}

function safeUint32(value, label, errors) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    errors.push(`${label} 必须是 uint32`);
    return false;
  }
  return true;
}

function validateArtifact(value) {
  const errors = [];
  if (!exactKeys(value, ["schemaVersion", "benchmark", "workload", "cases"], "artifact", errors)) {
    return { errors, workload: null };
  }
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push(`artifact.schemaVersion 必须为 ${SCHEMA_VERSION}`);
  if (value.benchmark !== BENCHMARK) errors.push(`artifact.benchmark 必须为 ${BENCHMARK}`);

  const workload = value.workload;
  if (exactKeys(workload, ["seed", "frames", "warmupFrames", "entityCounts"], "artifact.workload", errors)) {
    safeUint32(workload.seed, "artifact.workload.seed", errors);
    safePositiveInteger(workload.frames, "artifact.workload.frames", errors);
    safePositiveInteger(workload.warmupFrames, "artifact.workload.warmupFrames", errors);
    if (!Array.isArray(workload.entityCounts) || workload.entityCounts.length === 0) {
      errors.push("artifact.workload.entityCounts 必须是非空数组");
    } else {
      const seen = new Set();
      for (const [index, count] of workload.entityCounts.entries()) {
        safePositiveInteger(count, `artifact.workload.entityCounts[${index}]`, errors);
        if (seen.has(count)) errors.push(`artifact.workload.entityCounts 不得重复：${count}`);
        seen.add(count);
      }
      const totalFrames = workload.frames + workload.warmupFrames;
      for (const count of workload.entityCounts) {
        if (Number.isSafeInteger(count) && totalFrames * count * 2 > MAX_INPUT_VALUES) {
          errors.push(`artifact workload 过大：${totalFrames * count * 2} input values`);
        }
      }
    }
  }

  if (!Array.isArray(value.cases)) {
    errors.push("artifact.cases 必须是数组");
  } else if (workload && Array.isArray(workload.entityCounts)) {
    if (value.cases.length !== workload.entityCounts.length) {
      errors.push("artifact.cases 数量必须与 entityCounts 一致");
    }
    const expectedCaseKeys = [
      "entityCount",
      "input",
      "renderOpsPerFrame",
      "snapshotAllocationsPerFrame",
      "snapshotBytesEstimatePerFrame",
      "sinkChecksum",
    ];
    for (const [index, item] of value.cases.entries()) {
      const label = `artifact.cases[${index}]`;
      if (!exactKeys(item, expectedCaseKeys, label, errors)) continue;
      const expectedCount = workload.entityCounts[index];
      if (item.entityCount !== expectedCount) {
        errors.push(`${label}.entityCount 必须与 workload.entityCounts[${index}] 一致`);
      }
      const count = item.entityCount;
      const countValid = Number.isSafeInteger(count) && count >= 1 && count <= MAX_INTEGER;
      if (!countValid) errors.push(`${label}.entityCount 必须是正整数`);
      const input = item.input;
      if (exactKeys(input, ["checksum", "values"], `${label}.input`, errors)) {
        safeUint32(input.checksum, `${label}.input.checksum`, errors);
        const expectedValues = countValid
          && Number.isSafeInteger(workload.frames)
          && Number.isSafeInteger(workload.warmupFrames)
          ? (workload.frames + workload.warmupFrames) * count * 2
          : null;
        if (!Number.isSafeInteger(input.values) || input.values < 1) {
          errors.push(`${label}.input.values 必须是正整数`);
        } else if (expectedValues !== null && input.values !== expectedValues) {
          errors.push(`${label}.input.values 应为 ${expectedValues}`);
        }
      }
      if (countValid) {
        const expectedOps = 3 + 6 * count;
        if (item.renderOpsPerFrame !== expectedOps) errors.push(`${label}.renderOpsPerFrame 应为 ${expectedOps}`);
        if (item.snapshotAllocationsPerFrame !== count + 1) {
          errors.push(`${label}.snapshotAllocationsPerFrame 应为 ${count + 1}`);
        }
        if (item.snapshotBytesEstimatePerFrame !== (count + 1) * 64) {
          errors.push(`${label}.snapshotBytesEstimatePerFrame 应为 ${(count + 1) * 64}`);
        }
      }
      if (!Number.isSafeInteger(item.renderOpsPerFrame) || item.renderOpsPerFrame < 0) {
        errors.push(`${label}.renderOpsPerFrame 必须是非负整数`);
      }
      if (!Number.isSafeInteger(item.snapshotAllocationsPerFrame) || item.snapshotAllocationsPerFrame < 0) {
        errors.push(`${label}.snapshotAllocationsPerFrame 必须是非负整数`);
      }
      if (!Number.isSafeInteger(item.snapshotBytesEstimatePerFrame) || item.snapshotBytesEstimatePerFrame < 0) {
        errors.push(`${label}.snapshotBytesEstimatePerFrame 必须是非负整数`);
      }
      safeUint32(item.sinkChecksum, `${label}.sinkChecksum`, errors);
    }
  }
  return { errors, workload };
}

function deterministicProjection(result) {
  if (!isObject(result)) return null;
  // `--deterministic` already emits the artifact shape.  Accepting the full
  // probe shape as well keeps this helper useful if the CLI flag is removed or
  // a caller invokes the tool directly in a diagnostic script.
  if (isObject(result.workload) && Array.isArray(result.workload.entityCounts)) {
    return {
      schemaVersion: result.schemaVersion,
      benchmark: result.benchmark,
      workload: {
        seed: result.workload.seed,
        frames: result.workload.frames,
        warmupFrames: result.workload.warmupFrames,
        entityCounts: result.workload.entityCounts,
      },
      cases: result.cases,
    };
  }
  if (!Array.isArray(result.entityCounts) || !Array.isArray(result.cases)) return null;
  return {
    schemaVersion: result.schemaVersion,
    benchmark: result.benchmark,
    workload: {
      seed: result.seed,
      frames: result.frames,
      warmupFrames: result.warmupFrames,
      entityCounts: result.entityCounts,
    },
    cases: result.cases.map((item) => ({
      entityCount: item.entityCount,
      input: item.input,
      renderOpsPerFrame: item.renderOpsPerFrame,
      snapshotAllocationsPerFrame: item.snapshotAllocationsPerFrame,
      snapshotBytesEstimatePerFrame: item.snapshotBytesEstimatePerFrame,
      sinkChecksum: item.sinkChecksum,
    })),
  };
}

/** Compare JSON values without making object member order part of the contract. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function runProbe(workload) {
  const args = [
    "--import", "tsx", TOOL,
    "--json", "--deterministic",
    "--seed", String(workload.seed),
    "--frames", String(workload.frames),
    "--warmup", String(workload.warmupFrames),
    "--entities", workload.entityCounts.join(","),
  ];
  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAX_CHILD_OUTPUT,
    env: process.env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    const detail = String(child.stderr || child.stdout || "").trim();
    throw new Error(`性能探针退出码 ${String(child.status)}${detail ? `：${detail}` : ""}`);
  }
  const output = String(child.stdout).trim();
  if (!output) throw new Error("性能探针没有输出 JSON");
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`性能探针输出不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return 0;
  const errors = [];
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(options.artifact, "utf8"));
  } catch (error) {
    errors.push(`无法读取性能基线 ${options.artifact}：${error instanceof Error ? error.message : String(error)}`);
  }

  let workload = null;
  if (artifact !== undefined) {
    const validation = validateArtifact(artifact);
    errors.push(...validation.errors);
    workload = validation.workload;
  }

  let actual = null;
  if (errors.length === 0 && workload) {
    try {
      actual = deterministicProjection(runProbe(workload));
      if (actual === null) errors.push("性能探针结果缺少可比较的结构字段");
      else if (canonicalJson(actual) !== canonicalJson(artifact)) {
        errors.push("性能基线结构结果与当前探针不一致；请确认是否发生了预期玩法/渲染变更并更新 artifact");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (options.json) {
    const payload = errors.length === 0
      ? { ok: true, benchmark: BENCHMARK, cases: workload?.entityCounts?.length ?? 0 }
      : { ok: false, errors };
    console.log(JSON.stringify(payload));
  } else if (errors.length === 0) {
    console.log(`✔ ${BENCHMARK} deterministic performance baseline verified (${workload.entityCounts.length} cases; timing/heap excluded)`);
  } else {
    for (const error of errors) console.error(`✘ ${error}`);
  }
  return errors.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`✘ 性能基线校验参数错误：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
