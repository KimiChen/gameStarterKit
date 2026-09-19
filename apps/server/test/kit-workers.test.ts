/**
 * kit worker 登记面（docs/MMO.md §5.4 MF7a；docs/MMO-PLAN.md MF7a-B1）：
 *  - kit.json v1 增量可选字段 `workers[] {id, entry}` 与 `sql.tables[].role:"world-event"`（⛔ 不 bump schemaVersion）；
 *  - entry 必须落在本 kit 的 apps/server/src/kits/<id>/workers/；id 唯一；
 *  - 锁抬头 `workers` 往返；插件锁不得带 workers；无 worker 的 kit 抬头不写该键（旧锁字节不变）。
 * 变异验证：parseKitRegistration 删 entry 前缀检查 → 「越出本 kit 目录」转红；lock 解析删「插件锁不该有 workers」→ 转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKitRegistration } from "../tools/plugin-codegen/pluginManifestSchema";
import { parseInstalledLock, renderInstalledLock, type InstalledLock } from "../tools/plugin/lock";

const base = {
  schemaVersion: 1,
  id: "kfix",
  version: "1.0.0",
  api: { default: { version: 1, minSupported: 1 } },
  sql: { files: ["sql/001-init.sql"], tables: [{ name: "k_kfix_event", zone: "per-zone", role: "world-event" }] },
};

test("kit.json：workers[] 与 sql.tables[].role 解析；缺省为空 / 无 role", () => {
  const reg = parseKitRegistration({ ...base, workers: [{ id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" }] }, "kit.json");
  assert.deepEqual(reg.workers, [{ id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" }]);
  assert.deepEqual(reg.sql.tables, [{ name: "k_kfix_event", zone: "per-zone", role: "world-event" }]);
  const plain = parseKitRegistration({ ...base, sql: { files: ["sql/001-init.sql"], tables: [{ name: "k_kfix_t", zone: "global" }] } }, "kit.json");
  assert.deepEqual(plain.workers, []);
  assert.deepEqual(plain.sql.tables, [{ name: "k_kfix_t", zone: "global" }], "无 role 时不写出 role 键（生成物字节不变）");
});

test("kit.json：worker id 重复 / entry 越出本 kit 目录 / entry 形态非法 / role 非法 一律拒绝", () => {
  assert.throws(() => parseKitRegistration({ ...base, workers: [
    { id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" },
    { id: "tick", entry: "apps/server/src/kits/kfix/workers/other.ts" },
  ] }, "kit.json"), /worker id/u);
  assert.throws(() => parseKitRegistration({ ...base, workers: [{ id: "tick", entry: "apps/server/src/kits/other/workers/tick.ts" }] }, "kit.json"),
    /必须落在 apps\/server\/src\/kits\/kfix\/workers\//u);
  assert.throws(() => parseKitRegistration({ ...base, workers: [{ id: "tick", entry: "apps/server/src/kits/kfix/tick.ts" }] }, "kit.json"));
  assert.throws(() => parseKitRegistration({ ...base, workers: [{ id: "Tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" }] }, "kit.json"));
  assert.throws(() => parseKitRegistration({ ...base, sql: { files: ["sql/001-init.sql"], tables: [{ name: "k_kfix_event", zone: "per-zone", role: "checkpoint" }] } }, "kit.json"));
});

test("锁抬头：kit 的 workers 往返；无 worker 不写键；插件锁带 workers 即拒", () => {
  const kit: InstalledLock = {
    manifest: {
      class: "kit", id: "kfix", version: "1.0.0", kinds: ["server"], constantName: null, modes: [], domains: [], fguiPackages: [],
      api: { default: { version: 1, minSupported: 1 } }, requires: { pluginApiVersion: null, kits: {} },
      workers: [{ id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" }],
    },
    entries: [],
    source: null,
  };
  const text = renderInstalledLock(kit);
  assert.match(text, /"workers":\[\{"id":"tick","entry":"apps\/server\/src\/kits\/kfix\/workers\/tick\.ts"\}\]/u);
  const parsed = parseInstalledLock(text, "kfix.lock");
  assert.deepEqual(parsed.manifest.workers, kit.manifest.workers);
  const bare = renderInstalledLock({ ...kit, manifest: { ...kit.manifest, workers: [] } });
  assert.doesNotMatch(bare, /workers/u, "无 worker 的 kit 抬头不出现 workers 键（既有锁字节不变）");
  assert.deepEqual(parseInstalledLock(bare, "kfix.lock").manifest.workers, []);
  const plugin = text.replace('"class":"kit",', "").replace(/"modes":\[\],"api":\{[^}]*\}\},/u, "").replace(/"api":\{[^}]*\}\}?,/u, "");
  assert.throws(() => parseInstalledLock(plugin.replace(/kit /u, "插件 "), "p.lock"), /插件锁不该有 (workers|modes)/u);
  assert.throws(() => parseInstalledLock(text.replace('"entry":"apps/server/src/kits/kfix/workers/tick.ts"', '"entry":"apps/server/src/core/x.ts"'), "kfix.lock"), /workers 条目非法/u);
});
