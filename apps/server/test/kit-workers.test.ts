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

// ── MF7a-B4：worker 进程入口的主循环（全部依赖注入；⛔ 不连库、不起进程）──
import { LeaseLostError, type SingletonLease } from "../src/core/infra/lease";
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import { defineKitWorker, isKitWorkerDefinition, type KitWorkerTx } from "../src/core/infra/kitApi";
import {
  KitWorkerUsageError, parseWorkerTarget, parseWorkerZones, resolveWorkerSpec, runKitWorker, type KitWorkerRuntimeDeps,
} from "../src/workers/kitWorker";

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

const KFIX_CAT: ServerKitCatalogEntry = {
  id: "kfix", version: "1.0.0", api: {}, modes: [], domains: [], effects: [], sqlFiles: [], sqlTables: [], userKeys: [],
  workers: [{ id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" }],
};
const LEASE: SingletonLease = { leaseName: "kit:kfix:tick", holder: "h", fenceToken: 1 };

interface RuntimeCalls {
  imports: string[];
  acquires: number;
  sleeps: number[];
  passes: { sId: number; now: number }[];
  logs: string[];
  onSleep?: (count: number) => void;
}

function runtimeDeps(over: { def?: unknown; leases?: (SingletonLease | null)[]; withWorkerTx?: KitWorkerRuntimeDeps["withWorkerTx"] }) {
  const controller = new AbortController();
  const calls: RuntimeCalls = { imports: [], acquires: 0, sleeps: [], passes: [], logs: [] };
  const leases = [...(over.leases ?? [LEASE])];
  const deps: KitWorkerRuntimeDeps = {
    catalog: [KFIX_CAT],
    importEntry: async (entry) => { calls.imports.push(entry); return { default: over.def }; },
    zones: [1, 2],
    holder: "h",
    tryAcquireLease: async () => { calls.acquires += 1; return leases.length > 1 ? (leases.shift() ?? null) : (leases[0] ?? null); },
    withWorkerTx: over.withWorkerTx ?? (async (kitId, workerId, sId, lease, fn) => {
      assert.equal(lease.leaseName, "kit:kfix:tick");
      const tx = { kitId, workerId, sId, fenceToken: lease.fenceToken } as unknown as KitWorkerTx;
      return fn(tx);
    }),
    sleep: async (ms) => { calls.sleeps.push(ms); calls.onSleep?.(calls.sleeps.length); },
    now: () => 1000,
    log: (line) => { calls.logs.push(line); },
    signal: controller.signal,
    acquireRetryMs: 5000,
    maxIdleMs: 4000,
  };
  return { deps, calls, controller };
}

test("worker 入口：目标 / 区清单解析；未登记（kit 或 worker）即拒且不 import、不抢租", async () => {
  assert.deepEqual(parseWorkerTarget("kfix:tick"), { kitId: "kfix", workerId: "tick" });
  for (const bad of [undefined, "", "kfix", "Kfix:tick", "kfix:tick:x", "k_fix:tick"]) { assert.throws(() => parseWorkerTarget(bad), KitWorkerUsageError); }
  assert.deepEqual(parseWorkerZones(" 1, 2 "), [1, 2]);
  for (const bad of [undefined, "", "1,1", "a", "70000", "1,,2"]) { assert.throws(() => parseWorkerZones(bad), KitWorkerUsageError); }
  assert.deepEqual(resolveWorkerSpec([KFIX_CAT], { kitId: "kfix", workerId: "tick" }), { id: "tick", entry: "apps/server/src/kits/kfix/workers/tick.ts" });
  const { deps, calls, controller } = runtimeDeps({ def: defineKitWorker({ pass: async () => { controller.abort(); } }) });
  await assert.rejects(runKitWorker({ kitId: "kfix", workerId: "sweep" }, deps), /worker "sweep" 未登记在 kit "kfix"/u);
  await assert.rejects(runKitWorker({ kitId: "nope", workerId: "tick" }, deps), /kit "nope" 未登记/u);
  assert.deepEqual(calls.imports, [], "未登记 ⛔ 不 import");
  assert.equal(calls.acquires, 0);
});

test("worker 入口：entry 默认导出必须是 defineKitWorker 产物；defineKitWorker 参数闸", async () => {
  const { deps, calls } = runtimeDeps({ def: { pass: async () => undefined } });
  await assert.rejects(runKitWorker({ kitId: "kfix", workerId: "tick" }, deps), /不是 defineKitWorker/u);
  assert.equal(calls.acquires, 0);
  assert.throws(() => defineKitWorker({ pass: 1 as never }), TypeError);
  assert.throws(() => defineKitWorker({ pass: async () => undefined, idleMs: 10 }), /idleMs 10 非法/u);
  const def = defineKitWorker({ pass: async () => undefined });
  assert.equal(isKitWorkerDefinition(def), true);
  assert.deepEqual([def.kind, def.idleMs, Object.isFrozen(def)], ["kit-worker", 1000, true]);
});

test("worker 入口：抢租失败等 acquireRetryMs 再试；抢到后逐区串行 pass（more ⇒ 同区再跑）；busy 大轮不空闲；停止信号后跑完当前事务停", async () => {
  let round = 0;
  const { deps, calls, controller } = runtimeDeps({
    leases: [null, LEASE],
    def: defineKitWorker({ idleMs: 30_000, pass: async (tx, ctx) => {
      round += 1;
      calls.passes.push({ sId: ctx.sId, now: ctx.now });
      assert.deepEqual([tx.kitId, tx.workerId, tx.sId, tx.fenceToken, ctx.kitId, ctx.workerId], ["kfix", "tick", ctx.sId, 1, "kfix", "tick"]);
      assert.equal(ctx.signal.aborted, false);
      if (round === 1) { return { more: true }; }   // 区 1 有积压 ⇒ 同区再跑
      if (round === 4) { controller.abort(); }     // 第二大轮的区 1 里收到停止
      return undefined;
    } }),
  });
  const report = await runKitWorker({ kitId: "kfix", workerId: "tick" }, deps);
  assert.deepEqual(report, { outcome: "stopped", passes: 4 });
  assert.equal(calls.acquires, 2);
  assert.deepEqual(calls.sleeps, [5000], "首次抢租失败等 acquireRetryMs；busy 大轮不空闲；停止后不再空闲");
  assert.deepEqual(calls.passes.map((p) => p.sId), [1, 1, 2, 1]);
  assert.deepEqual(calls.imports, ["apps/server/src/kits/kfix/workers/tick.ts"]);
  assert.match(calls.logs[0] ?? "", /抢租失败/u);
  assert.match(calls.logs[1] ?? "", /lease acquired holder=h fence=1 zones=1,2/u);
});

test("worker 入口：无积压 ⇒ 空闲 min(idleMs, maxIdleMs)；pass 异常记日志、本轮作废、空闲后再试；LeaseLostError 原样抛出（入口退出 1）", async () => {
  let n = 0;
  const { deps, calls, controller } = runtimeDeps({
    def: defineKitWorker({ idleMs: 30_000, pass: async () => { n += 1; if (n === 3) { throw new Error("boom"); } return undefined; } }),
  });
  calls.onSleep = (count) => { if (count === 2) { controller.abort(); } };
  const report = await runKitWorker({ kitId: "kfix", workerId: "tick" }, deps);
  assert.deepEqual(report, { outcome: "stopped", passes: 2 }, "passes 只数提交成功的轮（抛出的那轮已回滚）");
  assert.deepEqual(calls.sleeps, [4000, 4000], "idleMs 30000 被 maxIdleMs 4000 封顶");
  assert.ok(calls.logs.some((line) => /pass 失败.*boom/u.test(line)));

  const lost = runtimeDeps({
    def: defineKitWorker({ pass: async () => undefined }),
    withWorkerTx: async (_k, _w, _s, lease) => { throw new LeaseLostError(lease.leaseName); },
  });
  await assert.rejects(runKitWorker({ kitId: "kfix", workerId: "tick" }, lost.deps), LeaseLostError);
  assert.deepEqual(lost.calls.sleeps, [], "失租 ⛔ 不重试");
});

