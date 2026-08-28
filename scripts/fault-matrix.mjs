#!/usr/bin/env node
/**
 * P2-02 risk-weighted fault and mutation test entry point.
 *
 * The group definition lives in fault-matrix.config.json so adding a fault
 * point is a reviewable data change rather than an unnoticed shell glob.
 * Default execution runs deterministic unit groups. `--integration` appends
 * groups that require the local Redis/MySQL stack. Every child receives an
 * explicit group/fault-point context through environment variables; tests may
 * use that context to enable their injected failure branch.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_FILE = path.join(ROOT, "scripts", "fault-matrix.config.json");

function readConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  if (!config || typeof config !== "object" || config.schemaVersion !== 1) {
    throw new Error("fault-matrix.config.json schemaVersion 必须为 1");
  }
  for (const key of ["unitGroups", "integrationGroups"]) {
    if (!Array.isArray(config[key])) throw new Error(`${key} 必须是数组`);
  }
  const groups = [...config.unitGroups, ...config.integrationGroups];
  const ids = new Set();
  for (const [index, group] of groups.entries()) {
    if (!group || typeof group !== "object") throw new Error(`groups[${index}] 必须是 object`);
    if (typeof group.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(group.id)) {
      throw new Error(`groups[${index}].id 非法`);
    }
    if (ids.has(group.id)) throw new Error(`fault group id 重复：${group.id}`);
    ids.add(group.id);
    if (typeof group.cwd !== "string" || group.cwd.trim() === "" || path.isAbsolute(group.cwd)
      || group.cwd.includes("\\") || group.cwd.split("/").includes("..")) {
      throw new Error(`fault group ${group.id}.cwd 非法`);
    }
    if (!Array.isArray(group.files) || group.files.length === 0) {
      throw new Error(`fault group ${group.id} 缺少 files`);
    }
    if (!Array.isArray(group.faultPoints) || group.faultPoints.length === 0
      || group.faultPoints.some((point) => typeof point !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(point))) {
      throw new Error(`fault group ${group.id} 缺少合法 faultPoints`);
    }
    const points = new Set();
    for (const point of group.faultPoints) {
      if (points.has(point)) throw new Error(`fault group ${group.id} fault point 重复：${point}`);
      points.add(point);
    }
    const files = new Set();
    for (const file of group.files) {
      if (typeof file !== "string" || file.trim() === "" || path.isAbsolute(file)
        || file.includes("\\") || file.split("/").includes("..")) {
        throw new Error(`fault group ${group.id} 文件路径非法：${String(file)}`);
      }
      if (files.has(file)) throw new Error(`fault group ${group.id} 文件重复：${file}`);
      files.add(file);
    }
  }
  return {
    schemaVersion: 1,
    unitGroups: Object.freeze(config.unitGroups.map(freezeGroup)),
    integrationGroups: Object.freeze(config.integrationGroups.map(freezeGroup)),
  };
}

function freezeGroup(group) {
  return Object.freeze({
    id: group.id,
    cwd: group.cwd,
    files: Object.freeze([...group.files]),
    faultPoints: Object.freeze([...group.faultPoints]),
  });
}

export const FAULT_MATRIX_CONFIG = readConfig();
export const unitGroups = FAULT_MATRIX_CONFIG.unitGroups;
export const integrationGroups = FAULT_MATRIX_CONFIG.integrationGroups;

function parseArgs(argv) {
  let integration = false;
  let list = false;
  const selected = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--integration") {
      if (integration) throw new Error("--integration 参数重复");
      integration = true;
    } else if (arg === "--group") {
      const id = argv[++index];
      if (!id || id.startsWith("-")) throw new Error("--group 需要非空组名");
      if (selected.includes(id)) throw new Error(`--group 参数重复：${id}`);
      selected.push(id);
    } else if (arg === "--list") {
      if (list) throw new Error("--list 参数重复");
      list = true;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true, integration: false, list: false, selected: [] };
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (list && (integration || selected.length > 0)) {
    throw new Error("--list 不能与 --integration/--group 同时使用");
  }
  return { help: false, integration, list, selected };
}

function groupKind(group) {
  return integrationGroups.includes(group) ? "integration" : "unit";
}

function selectedGroups(parsed) {
  const all = parsed.integration ? [...unitGroups, ...integrationGroups] : [...unitGroups];
  if (parsed.selected.length === 0) return all;
  const byId = new Map([...unitGroups, ...integrationGroups].map((group) => [group.id, group]));
  const groups = [];
  for (const id of parsed.selected) {
    const group = byId.get(id);
    if (!group) throw new Error(`未知 fault group：${id}`);
    if (!parsed.integration && groupKind(group) === "integration") {
      // Selecting a named integration group is an explicit request; no need
      // to make callers remember a second flag.
    }
    groups.push(group);
  }
  return groups;
}

function usage() {
  return [
    "用法：node scripts/fault-matrix.mjs [--integration] [--group <id> ...]",
    "      node scripts/fault-matrix.mjs --list",
  ].join("\n");
}

function listGroups() {
  console.log(JSON.stringify({
    schemaVersion: 1,
    unit: unitGroups,
    integration: integrationGroups,
  }, null, 2));
}

function pathIsFile(relative) {
  try { return fs.statSync(path.join(ROOT, relative)).isFile(); } catch { return false; }
}

function childFileArgs(group) {
  const childRoot = path.join(ROOT, group.cwd);
  return group.files.map((file) => path.relative(childRoot, path.join(ROOT, file)).split(path.sep).join("/"));
}

function readCoverage(file, group) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`${group.id} 未生成 fault coverage：${error instanceof Error ? error.message : String(error)}`);
  }
  const executed = new Set();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`${group.id} coverage 第 ${index + 1} 行不是 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!record || typeof record !== "object"
      || typeof record.point !== "string"
      || !/^[a-z0-9][a-z0-9-]*$/.test(record.point)) {
      throw new Error(`${group.id} coverage 第 ${index + 1} 行缺少合法 point`);
    }
    executed.add(record.point);
  }
  const required = new Set(group.faultPoints);
  const unknown = [...executed].filter((point) => !required.has(point));
  if (unknown.length > 0) {
    throw new Error(`${group.id} coverage 含未声明 fault point：${unknown.join(", ")}`);
  }
  const missing = group.faultPoints.filter((point) => !executed.has(point));
  if (missing.length > 0) {
    throw new Error(`${group.id} 声明的 fault point 未实际执行：${missing.join(", ")}`);
  }
  return [...executed];
}

export function runFaultMatrix(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`[fault-matrix] ${error instanceof Error ? error.message : String(error)}`);
    console.error(usage());
    return 2;
  }
  if (parsed.help) {
    console.log(usage());
    return 0;
  }
  if (parsed.list) {
    listGroups();
    return 0;
  }

  let groups;
  try {
    groups = selectedGroups(parsed);
  } catch (error) {
    console.error(`[fault-matrix] ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const results = [];
  for (const group of groups) {
    const missing = group.files.filter((file) => !pathIsFile(file));
    if (missing.length > 0) {
      console.error(`[fault-matrix] ${group.id} 缺少测试文件：${missing.join(", ")}`);
      return 1;
    }
    const kind = groupKind(group);
    const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), "game-starter-fault-"));
    const coverageFile = path.join(coverageDir, "coverage.jsonl");
    const env = {
      ...process.env,
      FAULT_MATRIX: "1",
      FAULT_MATRIX_GROUP: group.id,
      FAULT_MATRIX_KIND: kind,
      FAULT_MATRIX_INTEGRATION: kind === "integration" ? "1" : "0",
      FAULT_MATRIX_FAULT_POINTS: group.faultPoints.join(","),
      FAULT_MATRIX_COVERAGE_FILE: coverageFile,
    };
    try {
      const args = ["--import", "tsx", "--test", ...childFileArgs(group)];
      const result = spawnSync(process.execPath, args, {
        cwd: path.join(ROOT, group.cwd),
        env,
        stdio: "inherit",
      });
      if (result.error) {
        console.error(`[fault-matrix] ${group.id} 启动失败：${result.error.message}`);
      }
      // A signalled child has no numeric status; preserve a conventional
      // non-zero result instead of accidentally reporting a passing matrix.
      const status = result.status ?? 1;
      results.push({ id: group.id, kind, faultPoints: group.faultPoints, status });
      if (status !== 0) {
        console.error(`[fault-matrix] ${group.id} failed (exit=${status})`);
        return status;
      }
      let executed;
      try {
        executed = readCoverage(coverageFile, group);
      } catch (error) {
        console.error(`[fault-matrix] ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
      results[results.length - 1].executedFaultPoints = executed;
      console.log(`[fault-matrix] ${group.id} passed (fault points=${executed.join(",")})`);
    } finally {
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({
    schemaVersion: 1,
    integration: groups.some((group) => groupKind(group) === "integration"),
    groups: results,
  }));
  return 0;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = runFaultMatrix();
