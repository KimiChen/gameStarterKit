/**
 * MF9-B2 贡献点的三道闸（tools/plugin/{install,pack,check}.ts；docs/MMO.md MF9）：
 *  - 正向闸（install.assertKitRequirements）：kit 已装（锁或宿主自有树）且贡献点 id 真的由它声明；
 *  - kit 反向闸（install.assertKitDependentsCompatible）：已安装插件填充过的贡献点被删 / 契约变化 ⇒ 点名插件，--break-dependents 才放行；
 *  - pack（pack.collectPluginFiles）：contributes 指向所有权集之外或不存在的路径 ⇒ 整包拒绝。
 * 隔离临时根 + 手写锁，⛔ 不跑 codegen / git。
 * 变异验证：install.ts 删反向闸的 contributorsOfKit 循环 → 「反向闸点名」转红；pack.ts 删 contributes 越界判定 → 「越界 pack 拒」转红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { assertKitDependentsCompatible, assertKitRequirements, resolveKitContributions } from "../tools/plugin/install";
import { writeInstalledLock, type InstalledLock, type LockManifestSummary } from "../tools/plugin/lock";
import { parseKitManifest, parsePluginManifest } from "../tools/plugin/manifest";
import { collectPluginFiles } from "../tools/plugin/pack";
import { EMPTY_REQUIRES, schemaDigestOf } from "../tools/plugin-codegen/pluginManifestSchema";

const roots: string[] = [];
after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-contrib-gates-"));
  roots.push(root);
  return root;
}

function write(root: string, relative: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), text);
}

const SCHEMA = { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string", pattern: "^.{1,32}$" } } };
const KIT_JSON = {
  schemaVersion: 1, id: "kfix", version: "1.0.0", api: { board: { version: 1, minSupported: 1 } },
  sql: { files: ["sql/001-init.sql"], tables: [{ name: "k_kfix_x", zone: "global" }] },
  contributions: {
    content: { kind: "data", ends: ["shared"], schema: SCHEMA },
    hook: { kind: "module", ends: ["server"], export: "hook" },
  },
};
const CONTENT_SUMMARY = { kind: "data" as const, ends: ["shared" as const], schemaDigest: schemaDigestOf(SCHEMA) };
const HOOK_SUMMARY = { kind: "module" as const, ends: ["server" as const], export: "hook" };
const kitLock = (contributions: LockManifestSummary["contributions"]): InstalledLock => ({
  manifest: {
    class: "kit", id: "kfix", version: "1.0.0", kinds: ["server"], constantName: null, modes: [], domains: [], fguiPackages: [],
    api: { board: { version: 1, minSupported: 1 } }, requires: EMPTY_REQUIRES, workers: [], contributions, fragments: [], contributes: {},
  },
  entries: [],
});
const CONTENT_FILE = "apps/plugins/kfixShop/contributions/kfix/content.json";
const HOOK_FILE = "apps/server/src/core/kfixShop/hook.ts";
const PLUGIN_JSON = {
  schemaVersion: 2, id: "kfixShop", version: "1.0.0", entry: "apps/client/src/plugins/kfixShop/index.ts",
  requires: { kits: { kfix: { board: 1 } } },
  contributes: { kfix: { content: CONTENT_FILE, hook: HOOK_FILE } },
};
const pluginLock = (contributes: LockManifestSummary["contributes"]): InstalledLock => ({
  manifest: {
    class: "plugin", id: "kfixShop", version: "1.0.0", kinds: ["client"], constantName: null, modes: [], domains: [], fguiPackages: [],
    api: {}, requires: { pluginApiVersion: null, kits: { kfix: { board: 1 } } }, workers: [], contributions: {}, fragments: [], contributes,
  },
  entries: [],
});

test("正向闸：kit 已装且贡献点存在放行；kit 未装 / 缺贡献点点名；宿主自有 kit 读树", () => {
  const root = tempRoot();
  const manifest = parsePluginManifest(PLUGIN_JSON);
  assert.throws(() => assertKitRequirements(root, manifest), /kit "kfix" 未安装/u);
  writeInstalledLock(root, kitLock({ content: CONTENT_SUMMARY }));
  assert.throws(() => assertKitRequirements(root, manifest), /kit "kfix" 没有贡献点 "hook"（提供：content）/u);
  writeInstalledLock(root, kitLock({ content: CONTENT_SUMMARY, hook: HOOK_SUMMARY }));
  assert.doesNotThrow(() => assertKitRequirements(root, manifest));
  assert.deepEqual(Object.keys(resolveKitContributions(root, "kfix") ?? {}), ["content", "hook"]);
  assert.equal(resolveKitContributions(root, "ghost"), null);

  const hostRoot = tempRoot();
  write(hostRoot, "apps/kits/kfix/kit.json", JSON.stringify({ ...KIT_JSON, version: undefined }));
  assert.doesNotThrow(() => assertKitRequirements(hostRoot, manifest), "宿主自有 kit（无 version）从树上读贡献点声明");
  assert.deepEqual(resolveKitContributions(hostRoot, "kfix"), { content: CONTENT_SUMMARY, hook: HOOK_SUMMARY });
});

test("kit 反向闸：已安装插件填充的贡献点被删或契约变化 ⇒ 点名插件；--break-dependents 放行并返回清单", () => {
  const root = tempRoot();
  writeInstalledLock(root, kitLock({ content: CONTENT_SUMMARY, hook: HOOK_SUMMARY }));
  writeInstalledLock(root, pluginLock({ kfix: { content: CONTENT_FILE, hook: HOOK_FILE } }));
  assert.deepEqual(assertKitDependentsCompatible(root, parseKitManifest(KIT_JSON), false), []);
  const dropped = parseKitManifest({ ...KIT_JSON, contributions: { content: KIT_JSON.contributions.content } });
  assert.throws(() => assertKitDependentsCompatible(root, dropped, false), /插件 "kfixShop"：贡献点 "hook" 已从 kit 删除/u);
  const changedSchema = parseKitManifest({ ...KIT_JSON, contributions: { ...KIT_JSON.contributions, content: { kind: "data", ends: ["shared"], schema: { ...SCHEMA, required: [] } } } });
  assert.throws(() => assertKitDependentsCompatible(root, changedSchema, false), /贡献点 "content" 的契约已变化（data:shared:[0-9a-f]{64} → data:shared:[0-9a-f]{64}）/u);
  const changedExport = parseKitManifest({ ...KIT_JSON, contributions: { ...KIT_JSON.contributions, hook: { kind: "module", ends: ["server"], export: "hook2" } } });
  assert.throws(() => assertKitDependentsCompatible(root, changedExport, false), /贡献点 "hook" 的契约已变化（module:server:hook → module:server:hook2）/u);
  const broken = assertKitDependentsCompatible(root, dropped, true);
  assert.deepEqual(broken, ["插件 \"kfixShop\"：贡献点 \"hook\" 已从 kit 删除（插件仍在 contributes 里填充它）"]);
  // 无人填充的贡献点随便改
  writeInstalledLock(root, pluginLock({ kfix: { content: CONTENT_FILE } }));
  assert.deepEqual(assertKitDependentsCompatible(root, dropped, false), []);
});

test("pack：contributes 指向所有权集之外（别的插件目录 / 生成物形态）或不存在的路径 ⇒ 整包拒绝并点名；合法路径进采集", () => {
  const root = tempRoot();
  write(root, "apps/plugins/kfixShop/plugin.json", JSON.stringify(PLUGIN_JSON));
  write(root, CONTENT_FILE, "{\"title\":\"x\"}\n");
  const manifest = parsePluginManifest(PLUGIN_JSON);
  assert.throws(() => collectPluginFiles(root, manifest), /contributes\.kfix\.hook 路径 "apps\/server\/src\/core\/kfixShop\/hook\.ts" 不存在，拒绝打包/u);
  write(root, HOOK_FILE, "export const hook = 1;\n");
  const collected = collectPluginFiles(root, manifest);
  assert.ok(collected.files.has(HOOK_FILE) && collected.files.has(CONTENT_FILE), "合法贡献文件随包采集");
  const foreign = parsePluginManifest({ ...PLUGIN_JSON, contributes: { kfix: { hook: "apps/server/src/core/redeem/hook.ts" } } });
  assert.throws(() => collectPluginFiles(root, foreign), /contributes\.kfix\.hook 路径 "apps\/server\/src\/core\/redeem\/hook\.ts" 不在所有权推导集内[^\n]*越界贡献/u);
  write(root, "apps/server/src/core/kfixShop/x.generated.ts", "export const hook = 1;\n");
  const generated = parsePluginManifest({ ...PLUGIN_JSON, contributes: { kfix: { hook: "apps/server/src/core/kfixShop/x.generated.ts" } } });
  assert.throws(() => collectPluginFiles(root, generated), /越界贡献/u);
});
