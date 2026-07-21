/**
 * vendored 运行时版本一致性机检（THIRD_PARTY_NOTICES.md 的执行面）：
 * fetch 脚本钉的版本是唯一真源，与入库产物内容、package-lock、双端 major.minor（铁律 7）、
 * CLAUDE.md 技术栈声明五方对齐——升级时改漏任何一处本测试当场红。
 * 随 npm run test:fgui / CI 跑（bitECS 的一致性由 verify:ecs 字节锁另行把关）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function pin(file: string, re: RegExp): string {
  const m = re.exec(read(file));
  assert.ok(m, `${file} 里找不到版本钉（${re}）——fetch 脚本被改了记得同步本测试`);
  return m![1];
}

const SDK_VERSION = pin("scripts/fetch-colyseus.mjs", /SDK_VERSION = "([^"]+)"/);
const FGUI_VERSION = pin("scripts/fetch-fgui.sh", /FGUI_VERSION="([^"]+)"/);

test("colyseus UMD：入库产物内嵌版本 = fetch 脚本钉的版本（两侧副本）", () => {
  for (const rel of ["apps/client/src/lib/colyseus/colyseus.js", "apps/Cocos/assets/src/lib/colyseus/colyseus.js"]) {
    assert.ok(read(rel).includes(SDK_VERSION),
      `${rel} 不含 ${SDK_VERSION}——产物与 fetch 脚本版本脱节，重跑 npm run fetch:colyseus 并提交`);
  }
});

test("colyseus 双端版本：SDK = lock 里的 @colyseus/sdk；与服务端 colyseus 包 major.minor 一致（铁律 7）", () => {
  const lock = JSON.parse(read("package-lock.json")) as {
    packages: Record<string, { version?: string } | undefined>;
  };
  const lockSdk = lock.packages["node_modules/@colyseus/sdk"]?.version;
  const lockServer = lock.packages["node_modules/colyseus"]?.version;
  assert.equal(lockSdk, SDK_VERSION, "package-lock 的 @colyseus/sdk 与 fetch 脚本钉的版本不一致");
  assert.ok(lockServer, "package-lock 里找不到服务端 colyseus 包");
  const mm = (v: string) => v.split(".").slice(0, 2).join(".");
  assert.equal(mm(lockServer!), mm(SDK_VERSION),
    `双端 Colyseus major.minor 不一致（服务端 ${lockServer} vs 客户端 SDK ${SDK_VERSION}，铁律 7）`);
});

test("fairygui-cc：扩展外壳 package.json 版本 = fetch 脚本钉的版本", () => {
  const shell = JSON.parse(read("apps/Cocos/extensions/fairygui-cc/package.json")) as { version: string };
  assert.equal(shell.version, FGUI_VERSION,
    "扩展外壳版本与 fetch 脚本脱节——升级时两处一起改（外壳 version 供 Creator 展示）");
});

test("vendor 内容锁：产物 sha256 与 scripts/vendor.sha256 逐一相符", () => {
  // fairygui 运行时不内嵌版本串、又在 verify:sync 镜像域之外——内容锁是它唯一的守门；
  // colyseus.js 锁内容防「同版本号但内容被改」。升级经 fetch 脚本自动重钉；
  // 给 fairygui 打社区补丁后手动 node scripts/vendor-lock.mjs 重钉并连锁文件一起提交。
  const lock = read("scripts/vendor.sha256").trim().split("\n");
  assert.ok(lock.length >= 3, "vendor.sha256 至少应锁 3 个产物");
  for (const line of lock) {
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(m, `锁行格式非法：${line}`);
    const actual = createHash("sha256").update(readFileSync(join(ROOT, m![2]))).digest("hex");
    assert.equal(actual, m![1],
      `${m![2]} 内容与锁不符——非预期改动请还原；升级/打补丁后跑 node scripts/vendor-lock.mjs 重钉并提交`);
  }
});

test("CLAUDE.md 技术栈声明与钉死版本一致（文档不说谎）", () => {
  const claude = read("CLAUDE.md");
  assert.ok(claude.includes(SDK_VERSION), `CLAUDE.md 未声明 @colyseus/sdk ${SDK_VERSION}`);
  assert.ok(claude.includes(FGUI_VERSION), `CLAUDE.md 未声明 fairygui-cc ${FGUI_VERSION}`);
});
