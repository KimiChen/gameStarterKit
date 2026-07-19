/**
 * 微信小游戏构建体积报告（docs/CLIENT.md 方案 4 的准备项——触发条件的测量仪）。
 *
 * 用法：npm run report:size [-- <构建目录>]（默认 apps/Cocos/build/wechatgame）
 * 输出：主包 / 各分包（game.json subpackages）体积 + 4MB 红线水位；
 * 主包超 3.5MB（红线 87%）→ 提示启动 docs/CLIENT.md 方案 4 第一级（资源分包）。
 * 构建目录不存在时给出指引并正常退出（不阻塞 CI）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.resolve(ROOT, process.argv[2] ?? "apps/Cocos/build/wechatgame");

const MAIN_LIMIT = 4 * 1024 * 1024;      // 微信主包红线
const WARN_AT = 3.5 * 1024 * 1024;       // 方案 4 触发水位（红线 87%）

if (!fs.existsSync(buildDir)) {
  console.log(`[size] 构建目录不存在：${path.relative(ROOT, buildDir)}`);
  console.log("[size] 先在 Cocos Creator 构建微信小游戏，或传入目录：npm run report:size -- <dir>");
  process.exit(0);
}

/** 递归目录总字节数 */
function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";

// game.json 的 subpackages[].root 是分包目录；主包 = 总体积 - 各分包
let subRoots = [];
const gameJsonPath = path.join(buildDir, "game.json");
if (fs.existsSync(gameJsonPath)) {
  try {
    const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, "utf8"));
    subRoots = (gameJson.subpackages ?? gameJson.subPackages ?? []).map((s) => s.root.replace(/\/$/, ""));
  } catch (e) {
    console.warn("[size] game.json 解析失败（按无分包统计）:", e.message);
  }
}

const total = dirSize(buildDir);
let subTotal = 0;
const rows = [];
for (const root of subRoots) {
  const dir = path.join(buildDir, root);
  const size = fs.existsSync(dir) ? dirSize(dir) : 0;
  subTotal += size;
  rows.push(["分包 " + root, size]);
}
// remote/ 是 Creator 远程 Bundle 输出（CDN 内容，不进微信主包，也不在 game.json subpackages 里）
const remoteDir = path.join(buildDir, "remote");
const remoteSize = fs.existsSync(remoteDir) ? dirSize(remoteDir) : 0;
if (remoteSize > 0) { rows.push(["远程 Bundle (remote/)", remoteSize]); }
const main = total - subTotal - remoteSize;
rows.unshift(["主包", main]);
rows.push(["合计", total]);

console.log(`[size] ${path.relative(ROOT, buildDir)}`);
for (const [label, size] of rows) {
  console.log(`  ${label.padEnd(24)} ${mb(size).padStart(10)}`);
}
const pct = ((main / MAIN_LIMIT) * 100).toFixed(1);
console.log(`  主包水位 ${pct}%（红线 4MB）`);
if (main > MAIN_LIMIT) {
  console.error("[size] ❌ 主包已超微信 4MB 红线——立即执行 docs/CLIENT.md 方案 4（资源分包优先）");
  process.exit(1);
} else if (main > WARN_AT) {
  console.warn("[size] ⚠ 主包超过 3.5MB 触发水位——启动 docs/CLIENT.md 方案 4 第一级（FGUI 包迁 Bundle）");
}
