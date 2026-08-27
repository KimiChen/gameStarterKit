#!/usr/bin/env node
/**
 * Verify the starter project's identity, package graph and generated-source
 * declarations.  This is intentionally a small Node-only checker: it runs
 * before TypeScript and does not depend on workspace packages being installed.
 *
 * Usage:
 *   node scripts/verify-project-metadata.mjs [--root <directory>]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT_METADATA_SCHEMA_VERSION,
  PROJECT_ID_PATTERN,
  PACKAGE_NAME_PATTERN,
  PACKAGE_SCOPE_PATTERN,
  assertPackageNames,
  isPlainObject,
  isSafeRelativePath,
  projectSourceContent,
} from "./lib/project-metadata.mjs";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_GENERATED = {
  shared: {
    source: "apps/shared/src",
    mirrors: ["apps/client/src/shared", "apps/Cocos/assets/src/shared"],
  },
  client: {
    source: "apps/client/src",
    mirrors: ["apps/Cocos/assets/src"],
  },
};

function parseArgs(argv) {
  let root;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      if (i + 1 >= argv.length) throw new Error("--root 需要目录参数");
      root = argv[++i];
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      if (!root) throw new Error("--root 需要目录参数");
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("用法：node scripts/verify-project-metadata.mjs [--root <目录>] [--json]");
      return { help: true };
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return { root: root ? path.resolve(process.cwd(), root) : SCRIPT_ROOT, json };
}

function readJson(file, errors, label = file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${label} 无法读取或不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readText(file, errors, label = file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    errors.push(`${label} 无法读取：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function requireFile(root, relative, errors) {
  const file = path.join(root, relative);
  let stat;
  try { stat = fs.lstatSync(file); } catch { stat = null; }
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    errors.push(`缺少文件：${relative}`);
    return false;
  }
  return true;
}

function requireDir(root, relative, errors) {
  const file = path.join(root, relative);
  let stat;
  try { stat = fs.lstatSync(file); } catch { stat = null; }
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    errors.push(`缺少目录：${relative}`);
    return false;
  }
  return true;
}

function validateMetadata(metadata, errors) {
  if (!isPlainObject(metadata)) {
    errors.push("project.metadata.json 必须是 JSON object");
    return false;
  }
  const required = [
    "schemaVersion",
    "projectId",
    "name",
    "displayName",
    "scope",
    "brand",
    "license",
    "packages",
    "generated",
    "thirdParty",
  ];
  const unexpected = Object.keys(metadata).filter((key) => !required.includes(key));
  if (unexpected.length > 0) errors.push(`metadata 含未知字段：${unexpected.join(", ")}`);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) errors.push(`metadata 缺少字段：${key}`);
  }
  if (metadata.schemaVersion !== PROJECT_METADATA_SCHEMA_VERSION) {
    errors.push(`metadata.schemaVersion 必须为 ${PROJECT_METADATA_SCHEMA_VERSION}`);
  }
  if (typeof metadata.projectId !== "string" || !PROJECT_ID_PATTERN.test(metadata.projectId)) {
    errors.push("metadata.projectId 不符合 ^[a-z][a-z0-9_]{0,31}$");
  }
  for (const key of ["name", "displayName", "brand", "license"]) {
    if (typeof metadata[key] !== "string" || metadata[key].length < 1 || metadata[key].length > 128
      || /[\u0000-\u001f\u007f\u2028\u2029]/.test(metadata[key])) {
      errors.push(`metadata.${key} 必须是 1–128 位无控制字符文本`);
    }
  }
  if (metadata.license !== "MIT") {
    errors.push("metadata.license 当前必须登记为 MIT（根 LICENSE 也必须是 MIT 文本）");
  }
  if (metadata.scope !== null
    && (typeof metadata.scope !== "string" || !PACKAGE_SCOPE_PATTERN.test(metadata.scope))) {
    errors.push("metadata.scope 必须是 @scope 或 null");
  }
  if (!isPlainObject(metadata.packages)) {
    errors.push("metadata.packages 必须是 object");
  } else {
    const packageKeys = ["root", "shared", "server", "website", "client"];
    for (const key of Object.keys(metadata.packages)) {
      if (!packageKeys.includes(key)) errors.push(`metadata.packages 含未知字段：${key}`);
    }
    for (const key of packageKeys) {
      if (typeof metadata.packages[key] !== "string" || metadata.packages[key].length < 1) {
        errors.push(`metadata.packages.${key} 缺失`);
      } else {
        const value = metadata.packages[key];
        const valid = value.startsWith("@")
          ? /^@[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?![\s\S])/.test(value)
          : PACKAGE_NAME_PATTERN.test(value);
        if (!valid) errors.push(`metadata.packages.${key} 不是合法 npm 包名：${value}`);
      }
    }
    try {
      assertPackageNames(metadata);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!isPlainObject(metadata.generated)) {
    errors.push("metadata.generated 必须是 object");
  } else {
    for (const key of Object.keys(metadata.generated)) {
      if (!Object.prototype.hasOwnProperty.call(EXPECTED_GENERATED, key)) errors.push(`metadata.generated 含未知字段：${key}`);
    }
    for (const key of ["shared", "client"]) {
      const item = metadata.generated[key];
      if (!isPlainObject(item)) {
        errors.push(`metadata.generated.${key} 必须是 object`);
        continue;
      }
      for (const itemKey of Object.keys(item)) {
        if (!["source", "mirrors"].includes(itemKey)) errors.push(`metadata.generated.${key} 含未知字段：${itemKey}`);
      }
      for (const itemKey of ["source", "mirrors"]) {
        if (!Object.prototype.hasOwnProperty.call(item, itemKey)) errors.push(`metadata.generated.${key} 缺少字段：${itemKey}`);
      }
      if (!isSafeRelativePath(item.source)) errors.push(`metadata.generated.${key}.source 路径非法`);
      if (!Array.isArray(item.mirrors) || item.mirrors.length === 0) {
        errors.push(`metadata.generated.${key}.mirrors 必须是非空数组`);
      } else {
        for (const mirror of item.mirrors) {
          if (!isSafeRelativePath(mirror)) errors.push(`metadata.generated.${key}.mirrors 路径非法：${mirror}`);
        }
        if (new Set(item.mirrors).size !== item.mirrors.length) {
          errors.push(`metadata.generated.${key}.mirrors 不得重复`);
        }
      }
      const expected = EXPECTED_GENERATED[key];
      if (item.source !== expected.source) {
        errors.push(`metadata.generated.${key}.source 必须为 ${expected.source}`);
      }
      if (JSON.stringify(item.mirrors) !== JSON.stringify(expected.mirrors)) {
        errors.push(`metadata.generated.${key}.mirrors 必须为 ${expected.mirrors.join(", ")}`);
      }
    }
  }

  if (!Array.isArray(metadata.thirdParty) || metadata.thirdParty.length === 0) {
    errors.push("metadata.thirdParty 必须登记至少一个第三方组件");
  } else {
    const ids = new Set();
    for (const [index, record] of metadata.thirdParty.entries()) {
      const prefix = `metadata.thirdParty[${index}]`;
      if (!isPlainObject(record)) {
        errors.push(`${prefix} 必须是 object`);
        continue;
      }
      for (const key of Object.keys(record)) {
        if (!["id", "package", "version", "license", "source", "paths", "notice"].includes(key)) {
          errors.push(`${prefix} 含未知字段：${key}`);
        }
      }
      for (const key of ["id", "package", "version", "license", "source"]) {
        if (typeof record[key] !== "string" || record[key].length < 1) errors.push(`${prefix}.${key} 缺失`);
      }
      if (typeof record.id === "string") {
        if (ids.has(record.id)) errors.push(`${prefix}.id 重复：${record.id}`);
        ids.add(record.id);
      }
      if (typeof record.source === "string") {
        let sourceUrl;
        try { sourceUrl = new URL(record.source); } catch { /* reported below */ }
        if (!sourceUrl || !["http:", "https:"].includes(sourceUrl.protocol) || !sourceUrl.hostname) {
          errors.push(`${prefix}.source 必须是带主机名的 http(s) URL`);
        }
      }
      if (!Array.isArray(record.paths) || record.paths.length === 0) {
        errors.push(`${prefix}.paths 必须是非空数组`);
      } else {
        for (const item of record.paths) {
          if (!isSafeRelativePath(item)) errors.push(`${prefix}.paths 路径非法：${item}`);
        }
      }
      if (record.notice !== undefined && !isSafeRelativePath(record.notice)) {
        errors.push(`${prefix}.notice 路径非法`);
      }
    }
  }
  return errors.length === 0;
}

function firstEnvValue(text, key) {
  if (typeof text !== "string") return undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] !== key) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value;
  }
  return undefined;
}

function verifyPackages(root, metadata, errors) {
  const packageFiles = [
    ["package.json", "root"],
    ["apps/shared/package.json", "shared"],
    ["apps/server/package.json", "server"],
    ["apps/website/package.json", "website"],
    ["apps/Cocos/package.json", "client"],
  ];
  const parsed = new Map();
  for (const [relative, key] of packageFiles) {
    const file = path.join(root, relative);
    if (!requireFile(root, relative, errors)) continue;
    const pkg = readJson(file, errors, relative);
    if (!pkg) continue;
    parsed.set(key, pkg);
    if (pkg.name !== metadata.packages[key]) {
      errors.push(`${relative}.name 不一致：应为 ${metadata.packages[key]}，实际为 ${pkg.name ?? "<missing>"}`);
    }
    const packageName = pkg.name;
    const validPackageName = typeof packageName === "string"
      && (packageName.startsWith("@")
        ? /^@[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?![\s\S])/.test(packageName)
        : PACKAGE_NAME_PATTERN.test(packageName));
    if (!validPackageName) errors.push(`${relative}.name 不是合法 npm 包名：${packageName ?? "<missing>"}`);
  }
  const rootPackage = parsed.get("root");
  if (rootPackage) {
    if (!Array.isArray(rootPackage.workspaces)
      || !rootPackage.workspaces.includes("apps/shared")
      || !rootPackage.workspaces.includes("apps/server")) {
      errors.push("package.json.workspaces 必须包含 apps/shared 和 apps/server");
    }
  }
  const server = parsed.get("server");
  if (server) {
    const deps = { ...(server.dependencies ?? {}), ...(server.devDependencies ?? {}) };
    if (deps[metadata.packages.shared] !== "0.1.0") {
      errors.push(`apps/server/package.json 未以 ${metadata.packages.shared}@0.1.0 声明 shared workspace`);
    }
  }

  const lockFile = path.join(root, "package-lock.json");
  if (requireFile(root, "package-lock.json", errors)) {
    const lock = readJson(lockFile, errors, "package-lock.json");
    if (lock) {
      if (lock.name !== metadata.packages.root) errors.push(`package-lock.json.name 不一致：应为 ${metadata.packages.root}`);
      const rootEntry = lock.packages?.[""];
      if (!rootEntry || rootEntry.name !== metadata.packages.root) {
        errors.push(`package-lock.json packages[\"\"].name 不一致：应为 ${metadata.packages.root}`);
      }
      for (const [relative, key] of [["apps/shared", "shared"], ["apps/server", "server"]]) {
        const entry = lock.packages?.[relative];
        if (!entry || entry.name !== metadata.packages[key]) {
          errors.push(`package-lock.json packages[\"${relative}\"].name 不一致：应为 ${metadata.packages[key]}`);
        }
        const link = lock.packages?.[`node_modules/${metadata.packages[key]}`];
        if (!link || link.link !== true || link.resolved !== relative) {
          errors.push(`package-lock.json 缺少 ${metadata.packages[key]} workspace link`);
        }
      }
      const serverEntry = lock.packages?.["apps/server"];
      if (serverEntry?.dependencies?.[metadata.packages.shared] !== "0.1.0") {
        errors.push(`package-lock.json apps/server 未登记 ${metadata.packages.shared}@0.1.0`);
      }
    }
  }

  const websiteLockRelative = "apps/website/package-lock.json";
  let websiteLockStat;
  try { websiteLockStat = fs.lstatSync(path.join(root, websiteLockRelative)); } catch { websiteLockStat = null; }
  if (websiteLockStat && !websiteLockStat.isSymbolicLink() && websiteLockStat.isFile()) {
    const lock = readJson(path.join(root, websiteLockRelative), errors, websiteLockRelative);
    if (lock && (lock.name !== metadata.packages.website || lock.packages?.[""]?.name !== metadata.packages.website)) {
      errors.push(`${websiteLockRelative} 根包名不一致：应为 ${metadata.packages.website}`);
    }
  } else if (websiteLockStat) {
    errors.push(`${websiteLockRelative} 必须是普通文件（不得是符号链接）`);
  }
}

function verifyGenerated(root, metadata, errors) {
  const generated = metadata.generated;
  if (!isPlainObject(generated)) return;
  for (const key of ["shared", "client"]) {
    const item = generated[key];
    if (!isPlainObject(item)) continue;
    if (isSafeRelativePath(item.source)) requireDir(root, item.source, errors);
    if (Array.isArray(item.mirrors)) {
      for (const mirror of item.mirrors) {
        if (isSafeRelativePath(mirror)) requireDir(root, mirror, errors);
      }
    }
  }
  const identityRelative = "apps/shared/src/project.ts";
  const identityFile = path.join(root, identityRelative);
  if (requireFile(root, identityRelative, errors)) {
    const actual = readText(identityFile, errors, identityRelative);
    if (actual !== null && actual !== projectSourceContent(metadata)) {
      errors.push(`${identityRelative} 与 project.metadata.json 不一致，请运行 npm run init:project`);
    }
  }
  const sharedIndexRelative = "apps/shared/src/index.ts";
  const sharedIndex = path.join(root, sharedIndexRelative);
  let sharedIndexStat;
  try { sharedIndexStat = fs.lstatSync(sharedIndex); } catch { sharedIndexStat = null; }
  if (sharedIndexStat?.isSymbolicLink()) {
    errors.push(`${sharedIndexRelative} 不得是符号链接`);
  } else if (sharedIndexStat?.isFile()) {
    const source = readText(sharedIndex, errors, sharedIndexRelative);
    if (source !== null && !/export\s+\*\s+from\s+["']\.\/project["']\s*;/.test(source)) {
      errors.push(`${sharedIndexRelative} 未导出 ./project 身份真源`);
    }
  }
}

function verifyThirdParty(root, metadata, errors) {
  const noticeFiles = new Set();
  const records = Array.isArray(metadata.thirdParty) ? metadata.thirdParty : [];
  for (const record of records) {
    if (!isPlainObject(record)) continue;
    for (const relative of (Array.isArray(record.paths) ? record.paths : [])) {
      if (!isSafeRelativePath(relative)) continue;
      const absolute = path.join(root, relative);
      let stat;
      try { stat = fs.lstatSync(absolute); } catch { stat = null; }
      if (!stat) {
        errors.push(`第三方产物缺失：${relative}`);
      } else if (stat.isSymbolicLink()) {
        errors.push(`第三方产物不得是符号链接：${relative}`);
      }
    }
    const notice = record.notice ?? "THIRD_PARTY_NOTICES.md";
    if (!isSafeRelativePath(notice)) continue;
    noticeFiles.add(notice);
  }
  for (const relative of noticeFiles) {
    const noticeFile = path.join(root, relative);
    let noticeStat;
    try { noticeStat = fs.lstatSync(noticeFile); } catch { noticeStat = null; }
    if (!noticeStat || noticeStat.isSymbolicLink() || !noticeStat.isFile()) {
      errors.push(`${relative} 必须是普通文件（不得是符号链接）`);
      continue;
    }
    const text = readText(noticeFile, errors, relative);
    if (text === null) continue;
    for (const record of records) {
      if (!isPlainObject(record)) continue;
      const notice = record.notice ?? "THIRD_PARTY_NOTICES.md";
      if (notice !== relative) continue;
      if (!text.includes(record.package) || !text.includes(record.license) || !text.includes(record.version)) {
        errors.push(`${relative} 未完整登记 ${record.package} ${record.version} ${record.license}`);
      }
    }
  }
}

export function verifyProjectMetadata(root) {
  const errors = [];
  let rootStat;
  try { rootStat = fs.lstatSync(root); } catch { rootStat = null; }
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    errors.push("项目根必须是普通目录（不得是符号链接）");
    return { ok: false, errors };
  }
  const metadataRelative = "project.metadata.json";
  if (!requireFile(root, metadataRelative, errors)) {
    return { ok: false, errors };
  }
  const metadata = readJson(path.join(root, metadataRelative), errors, metadataRelative);
  if (!metadata) return { ok: false, errors };
  validateMetadata(metadata, errors);
  if (metadata && isPlainObject(metadata)) {
    if (isPlainObject(metadata.packages)) verifyPackages(root, metadata, errors);
    const envFile = path.join(root, ".env.development");
    let envStat;
    try { envStat = fs.lstatSync(envFile); } catch { envStat = null; }
    const envText = envStat?.isSymbolicLink()
      ? (errors.push(".env.development 不得是符号链接"), null)
      : readText(envFile, errors, ".env.development");
    if (envText !== null && firstEnvValue(envText, "PROJECT_ID") !== metadata.projectId) {
      errors.push(`.env.development 首个 PROJECT_ID 不一致：应为 ${metadata.projectId}`);
    }
    verifyGenerated(root, metadata, errors);
    verifyThirdParty(root, metadata, errors);
  }
  const licenseFile = path.join(root, "LICENSE");
  let licenseStat;
  try { licenseStat = fs.lstatSync(licenseFile); } catch { licenseStat = null; }
  if (!licenseStat || licenseStat.isSymbolicLink() || !licenseStat.isFile()) {
    errors.push("根 LICENSE 缺失或不得是符号链接（P2-03 要求项目自身许可证）");
  } else {
    const license = readText(path.join(root, "LICENSE"), errors, "LICENSE");
    if (license !== null && !/MIT License|Permission is hereby granted/i.test(license)) {
      errors.push("根 LICENSE 未能识别为已登记的 MIT 许可证文本");
    }
  }
  return { ok: errors.length === 0, errors, metadata };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) return;
    const result = verifyProjectMetadata(args.root);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      if (!args.json) {
        console.error(`[verify-project-metadata] ✘ ${result.errors.length} 处问题：`);
        for (const error of result.errors) console.error(`  - ${error}`);
      }
      process.exitCode = 1;
      return;
    }
    if (!args.json) console.log(`[verify-project-metadata] ✔ 项目身份、包名、生成区和第三方登记一致`);
  } catch (error) {
    console.error(`[verify-project-metadata] ✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]) {
  const invoked = path.resolve(process.argv[1]);
  if (fs.existsSync(invoked) && fs.realpathSync(invoked) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
}
