/**
 * mmo kit orchestration 面（MK4-B1；纯函数 / 运行器 / harness，⛔ 起房 ⛔ 连库）：
 *  - validateOrchestrationCommand：十五种 op 的合法形态归一；未知 op / 多键 / 缺键 / 数值域 / 文本 / prompt 选项重复一律 OrchestrationContractError；
 *  - defineOrchestration：版本 / packId / subscribes（非空、闭合、不重复）/ tickEvery 域 / interacts / limits / handle / 多余键；effectiveLimits 取小；
 *  - OrchestrationRunner：未订阅不投；tick 节拍按 bucket 错峰；timer（≥ 500 ms、repeat 重排、cancel、≤ 32）；vars ≤ 4 KB；publishState ≤ 16 键 + rev；
 *    65 条命令 ⇒ suspend（整批丢弃、后续事件不收、packSuspended 只投一次且其命令不生效）；假时钟超预算 ⇒ suspend；handler 抛 ⇒ suspend；坏命令 ⇒ suspend；
 *    sayWorld 限频 6/min；resume 恢复；快照往返（timers 重排）；
 *  - rng：同 instanceId / tick / eventSeq / stream 同值，同事件内连续取值不同但确定；
 *  - createOrchestrationHarness：emit / advance / vars / publish / ring；replay 逐条相等，改种子不等。
 * 变异验证：runner.dispatch 不数命令（删 commands > 64 判定）→ 「65 条 ⇒ suspend」红；validator 不查多余键 → 「多键」红；harness replay 不比对摘要 → 「改种子不等」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MMO_ORCHESTRATION_VERSION, ORCH_MAX_EVENT_QUEUE, ORCH_MAX_VARS_BYTES, OrchestrationContractError, defineOrchestration, digestOf, effectiveLimits, stableStringify, validateOrchestrationCommand,
    type OrchestrationCommand, type OrchestrationEvent, type OrchestrationModule,
} from "@game/shared/kits/mmo/api/orchestration/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { CHECKPOINTED_VARS_MAX_ROWS, createOrchestrationHarness, listCheckpointedVars, regionContains } from "../src/kits/mmo/api/orchestration/index";
import { assertKitTableAccess, type KitTx } from "../src/core/infra/kitApi";
import type { MmoTxRunner } from "../src/kits/mmo/host";
import { OrchestrationRunner, hashSeed, type RunnerWorld } from "../src/kits/mmo/orchestration/runner";
import { bossTimer, commandFlood } from "./fixtures/orchestrationFixture";

const emptyWorld: RunnerWorld = {
    entity: () => null, entitiesInRegion: () => [], playersInInstance: () => [], isWalkable: () => true, region: () => null, creature: () => null, item: () => null, partyMembersInInstance: (id) => [id],
};
const moduleOf = (handle: OrchestrationModule["handle"], over: Partial<OrchestrationModule> = {}): OrchestrationModule =>
    defineOrchestration({ orchestrationVersion: MMO_ORCHESTRATION_VERSION, packId: "greybox", subscribes: ["tick", "timer", "instanceStarted", "packSuspended"], tickEvery: 10, handle, ...over });
const runnerOf = (module: OrchestrationModule, over: Partial<ConstructorParameters<typeof OrchestrationRunner>[0]> = {}): OrchestrationRunner =>
    new OrchestrationRunner({ module, instanceId: "i1", address: "0/greybox/0", fixedStepMs: 50, now: () => 0, ...over });

test("validateOrchestrationCommand：十五种 op 归一；未知 op / 多键 / 缺键 / 数值域 / 文本 / 选项重复 ⇒ OrchestrationContractError", () => {
    const ok: OrchestrationCommand[] = [
        { op: "spawn", templateId: "slime", pos: { x: 1, y: 2 }, tag: "boss", despawnAfterMs: 500, leashRegionId: "arena" },
        { op: "despawn", entityId: "orch:greybox:1" }, { op: "despawn", tag: "boss" },
        { op: "startTimer", timerId: "t", afterMs: 500, tag: "x", repeat: true }, { op: "cancelTimer", timerId: "t" },
        { op: "grantItem", toCharacterId: "c1", itemTemplateId: "slime-gel", count: 1, reason: "boss" }, { op: "grantCurrency", toCharacterId: "c1", amount: 5, reason: "talk" },
        { op: "sayNearby", anchorEntityId: "char:c1", text: "hi" }, { op: "sayWorld", text: "hi" }, { op: "notice", text: "hi", level: "warn" },
        { op: "setVar", key: "k", value: 1, durable: true }, { op: "publishState", key: "k", value: "v" },
        { op: "prompt", toEntityId: "char:c1", promptId: "p", choices: [{ id: "a", label: "A" }] }, { op: "teleportWithin", entityId: "char:c1", pos: { x: 1, y: 1 } },
        { op: "transfer", characterId: "c1", toMapId: "greybox-east", toPortalId: "gate-east" }, { op: "setRegionEnabled", regionId: "arena", enabled: false },
    ];
    for (const command of ok) assert.deepEqual(validateOrchestrationCommand(command), command, command.op);
    for (const [label, bad] of [
        ["unknown op", { op: "nuke" }], ["多键", { op: "sayWorld", text: "hi", extra: 1 }], ["缺键", { op: "grantItem", toCharacterId: "c1", itemTemplateId: "x", count: 1 }],
        ["timer < 500", { op: "startTimer", timerId: "t", afterMs: 499 }], ["count 0", { op: "grantItem", toCharacterId: "c1", itemTemplateId: "x", count: 0, reason: "r" }],
        ["空文本", { op: "notice", text: "   ", level: "info" }], ["level", { op: "notice", text: "x", level: "loud" }], ["选项重复", { op: "prompt", toEntityId: "e", promptId: "p", choices: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }],
        ["7 个选项", { op: "prompt", toEntityId: "e", promptId: "p", choices: Array.from({ length: 7 }, (_u, i) => ({ id: `c${i}`, label: "x" })) }], ["scalar", { op: "setVar", key: "k", value: { nested: 1 } }],
        ["pos 负", { op: "teleportWithin", entityId: "e", pos: { x: -1, y: 0 } }], ["非对象", "spawn"],
    ] as const) {
        assert.throws(() => validateOrchestrationCommand(bad), OrchestrationContractError, label);
    }
});

test("defineOrchestration：形状校验 + freeze；effectiveLimits 与 kit 硬上限取小", () => {
    assert.ok(Object.isFrozen(bossTimer) && Object.isFrozen(bossTimer.subscribes));
    const base = { orchestrationVersion: MMO_ORCHESTRATION_VERSION, packId: "greybox", subscribes: ["tick"] as const, handle: () => [] };
    for (const [label, bad] of [
        ["版本", { ...base, orchestrationVersion: 2 }], ["packId", { ...base, packId: "bad id" }], ["空订阅", { ...base, subscribes: [] }], ["未知事件", { ...base, subscribes: ["damage"] }],
        ["重复订阅", { ...base, subscribes: ["tick", "tick"] }], ["tickEvery 9", { ...base, tickEvery: 9 }], ["interacts 空 targets", { ...base, interacts: { talk: { targets: [] } } }],
        ["limits 多键", { ...base, limits: { maxSpawnsAlive: 1, nope: 1 } }], ["handle 非函数", { ...base, handle: 1 }], ["多余键", { ...base, extra: 1 }],
    ] as const) {
        assert.throws(() => defineOrchestration(bad as never), OrchestrationContractError, label);
    }
    assert.deepEqual(effectiveLimits({ limits: { maxSpawnsAlive: 4, maxGrantCount: 500 } }), { maxSpawnsAlive: 4, maxGrantCount: 99, maxCurrencyPerGrant: 10_000 });
});

test("runner：未订阅不投；tick 按 bucket 错峰；timer ≥ 500 ms / repeat 重排 / cancel / ≤ 32；vars ≤ 4 KB；publishState ≤ 16 键 + rev；快照往返 timers 重排", () => {
    const seen: string[] = [];
    const runner = runnerOf(moduleOf((event) => {
        seen.push(event.kind);
        if (event.kind === "instanceStarted") return [{ op: "startTimer", timerId: "once", afterMs: 500 }, { op: "startTimer", timerId: "rep", afterMs: 1000, repeat: true, tag: "r" }, { op: "cancelTimer", timerId: "never" }];
        if (event.kind === "timer" && event.timerId === "rep") return [{ op: "publishState", key: "fired", value: (event.tag ?? "") + "1" }];
        return [];
    }));
    assert.equal(runner.enqueue({ kind: "playerDied", entityId: "x" }), "unsubscribed");
    assert.equal(runner.enqueue({ kind: "instanceStarted", recovered: false, checkpointRev: 0 }), "queued");
    runner.dispatch(0, emptyWorld);
    assert.deepEqual([runner.timers().get("once")?.dueTick, runner.timers().get("rep")?.dueTick, runner.timers().size], [10, 20, 2], "500 ms = 10 步、1000 ms = 20 步");
    const ticks: number[] = [];
    for (let tick = 1; tick <= 40; tick += 1) { runner.schedule(tick); const before = seen.length; runner.dispatch(tick, emptyWorld); if (seen.slice(before).includes("tick")) ticks.push(tick); }
    assert.deepEqual(ticks.map((tick) => (tick + runner.bucket) % 10), ticks.map(() => 0), `tick 节拍按 bucket ${runner.bucket} 错峰`);
    assert.equal(ticks.length, 4);
    assert.deepEqual([seen.filter((kind) => kind === "timer").length, runner.timers().has("once"), runner.timers().get("rep")?.dueTick], [3, false, 60], "once 一次 + rep 两次（20 / 40）并重排到 60");
    assert.deepEqual(runner.publish(), { rev: 1, state: { fired: "r1" } }, "publish 值不变 rev 不动");
    // vars 4 KB ⇒ suspend；publish 17 键 ⇒ suspend
    const big = runnerOf(moduleOf(() => Array.from({ length: Math.ceil(ORCH_MAX_VARS_BYTES / 200) + 1 }, (_u, i) => ({ op: "setVar" as const, key: `blob${i}`, value: "x".repeat(200) }))));
    big.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.deepEqual([big.dispatch(0, emptyWorld).suspendedNow, big.suspended, big.vars().size], ["vars", "vars", 0]);
    const many = runnerOf(moduleOf(() => Array.from({ length: 17 }, (_u, i) => ({ op: "publishState" as const, key: `k${i}`, value: i }))));
    many.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.equal(many.dispatch(0, emptyWorld).suspendedNow, "publish");
    const timers = runnerOf(moduleOf(() => Array.from({ length: 33 }, (_u, i) => ({ op: "startTimer" as const, timerId: `t${i}`, afterMs: 500 }))));
    timers.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.equal(timers.dispatch(0, emptyWorld).suspendedNow, "timers");
    // 快照往返：timers 按 tick 差重排
    const snapshot = runner.snapshot();
    const restored = runnerOf(moduleOf(() => []));
    restored.restore(snapshot, 40, 5);
    assert.deepEqual([restored.timers().get("rep")?.dueTick, restored.publish().rev, restored.eventSeq, restored.ring.length], [25, 1, snapshot.eventSeq, snapshot.ring.length]);
});

test("runner fail-closed：65 条命令 ⇒ suspend（整批丢弃、不再收事件、packSuspended 只投一次且其命令不生效）；假时钟超预算 / handler 抛 / 坏命令 ⇒ suspend；resume 恢复；sayWorld 限频", () => {
    const flood = runnerOf(commandFlood);
    const suspendedEvents: OrchestrationEvent[] = [];
    const spy = runnerOf(moduleOf((event) => { if (event.kind === "packSuspended") { suspendedEvents.push(event); return [{ op: "setVar", key: "leak", value: 1 }]; } return Array.from({ length: 65 }, (_u, i) => ({ op: "setVar" as const, key: `k${i}`, value: i })); }));
    for (const target of [flood, spy]) {
        target.enqueue({ kind: "tick", tick: 0, bucket: 0 });
        const result = target.dispatch(0, emptyWorld);
        assert.deepEqual([result.suspendedNow, result.effects.length, target.vars().size], ["commands", 0, 0], "整批丢弃");
        assert.equal(target.enqueue({ kind: "tick", tick: 1, bucket: 0 }), "suspended", "不再收事件");
        assert.equal(target.notifySuspended(1, emptyWorld), true);
        assert.equal(target.notifySuspended(2, emptyWorld), false, "只投一次");
    }
    assert.deepEqual([suspendedEvents, spy.vars().size], [[{ kind: "packSuspended", reason: "commands" }], 0], "packSuspended 的命令不生效");
    spy.resume();
    assert.equal(spy.enqueue({ kind: "tick", tick: 3, bucket: 0 }), "queued");
    let clock = 0;
    const slow = runnerOf(moduleOf(() => { clock += 3; return []; }), { now: () => clock, budgetMs: 2 });
    slow.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.equal(slow.dispatch(0, emptyWorld).suspendedNow, "budget");
    const thrower = runnerOf(moduleOf(() => { throw new Error("boom"); }));
    thrower.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.equal(thrower.dispatch(0, emptyWorld).suspendedNow, "handler");
    const bad = runnerOf(moduleOf(() => [{ op: "nuke" } as never]));
    bad.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.equal(bad.dispatch(0, emptyWorld).suspendedNow, "command");
    const chatty = runnerOf(moduleOf(() => Array.from({ length: 8 }, () => ({ op: "sayWorld" as const, text: "hi" }))));
    chatty.enqueue({ kind: "tick", tick: 0, bucket: 0 });
    assert.equal(chatty.dispatch(0, emptyWorld).effects.length, 6, "sayWorld 每分钟 ≤ 6，多余丢弃不 suspend");
});

test("runner：队列溢出经 dispatch 报告暂停一次，通知一次；恢复后再次溢出重新报告", () => {
    const seen: OrchestrationEvent[] = [];
    const runner = runnerOf(moduleOf((event) => { seen.push(event); return []; }));
    const event: OrchestrationEvent = { kind: "instanceStarted", recovered: false, checkpointRev: 0 };
    const overflow = (): void => {
        for (let index = 0; index < ORCH_MAX_EVENT_QUEUE; index += 1) assert.equal(runner.enqueue(event), "queued");
        assert.equal(runner.enqueue(event), "overflow");
        assert.equal(runner.queued, 0, "溢出整队作废");
        assert.equal(runner.dispatch(0, emptyWorld).suspendedNow, "event-queue");
        assert.equal(runner.dispatch(1, emptyWorld).suspendedNow, null, "暂停只向宿主报告一次");
        assert.equal(runner.notifySuspended(1, emptyWorld), true);
        assert.equal(runner.notifySuspended(2, emptyWorld), false);
    };
    overflow();
    runner.resume();
    overflow();
    assert.deepEqual(seen, [{ kind: "packSuspended", reason: "event-queue" }, { kind: "packSuspended", reason: "event-queue" }]);
});

test("runner：重启恢复 vars / timers / publish / 序号并解除历史暂停，定时器重新运行", () => {
    const module = moduleOf((event) => {
        if (event.kind === "instanceStarted") return [{ op: "setVar", key: "saved", value: 7 }, { op: "publishState", key: "phase", value: "ready" }, { op: "startTimer", timerId: "next", afterMs: 1000 }];
        if (event.kind === "choice") return Array.from({ length: 65 }, () => ({ op: "setVar" as const, key: "discarded", value: true }));
        if (event.kind === "timer") return [{ op: "setVar", key: "fired", value: true }];
        return [];
    }, { subscribes: ["instanceStarted", "choice", "timer", "packSuspended"] });
    const source = runnerOf(module);
    source.enqueue({ kind: "instanceStarted", recovered: false, checkpointRev: 0 });
    source.dispatch(0, emptyWorld);
    source.enqueue({ kind: "choice", actorEntityId: "a", promptId: "p", choiceId: "c" });
    assert.equal(source.dispatch(10, emptyWorld).suspendedNow, "commands");
    const snapshot = source.snapshot();
    assert.equal(snapshot.suspended, "commands", "快照仍保留故障诊断");
    const restored = runnerOf(module);
    restored.restore(snapshot, 10, 0);
    assert.deepEqual([restored.suspended, restored.vars().get("saved"), restored.publish(), restored.eventSeq, restored.ring], [null, 7, snapshot.publish, snapshot.eventSeq, snapshot.ring]);
    assert.equal(restored.dispatch(0, emptyWorld).suspendedNow, null, "旧暂停不重新审计");
    restored.schedule(10);
    const result = restored.dispatch(10, emptyWorld);
    assert.deepEqual([result.events, result.suspendedNow, restored.vars().get("fired"), restored.vars().has("discarded")], [1, null, true, false]);
    const overflowing = runnerOf(module);
    for (let index = 0; index <= ORCH_MAX_EVENT_QUEUE; index += 1) overflowing.enqueue({ kind: "instanceStarted", recovered: true, checkpointRev: 1 });
    overflowing.restore(snapshot, 10, 0);
    assert.equal(overflowing.dispatch(0, emptyWorld).suspendedNow, "event-queue", "回灌不能抹掉本次初始化新发生的溢出");
});

test("rng / 摘要：同 instanceId・tick・eventSeq・stream 同值，同事件内连续取值确定且不同；stableStringify 键序无关；hashSeed 稳定", () => {
    const draws: number[][] = [];
    const module = moduleOf((_event, api) => { draws.push([api.rng("a"), api.rng("a"), api.rng("b")]); return []; });
    for (let round = 0; round < 2; round += 1) { const runner = runnerOf(module); runner.enqueue({ kind: "tick", tick: 7, bucket: 0 }); runner.dispatch(7, emptyWorld); }
    assert.deepEqual(draws[0], draws[1], "同种子同序列");
    assert.notEqual(draws[0]![0], draws[0]![1], "同 stream 连续取值不同");
    assert.notEqual(draws[0]![0], draws[0]![2]);
    const other = runnerOf(module, { instanceId: "i2" });
    other.enqueue({ kind: "tick", tick: 7, bucket: 0 });
    other.dispatch(7, emptyWorld);
    assert.notEqual(draws[2]![0], draws[0]![0], "instanceId 不同 ⇒ 不同");
    assert.equal(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
    assert.equal(digestOf({ b: 1, a: 2 }), digestOf({ a: 2, b: 1 }));
    assert.notEqual(digestOf({ a: 1 }), digestOf({ a: 2 }));
    assert.equal(hashSeed("greybox", "i1"), hashSeed("greybox", "i1"));
    const region = GREYBOX_PACK.regions[0];
    if (region) assert.equal(typeof regionContains(region, { x: 0, y: 0 }), "boolean");
});

test("harness：emit / advance / vars / publish / ring；replay 逐条相等、改种子（instanceId）后摘要不等；样本脚本 boss 定时 → spawn 效果", () => {
    const harness = createOrchestrationHarness({ module: bossTimer, pack: GREYBOX_PACK, mapId: "greybox", seed: 7, entities: [{ id: "char:c1", kind: "character", templateId: "fighter", name: "A", x: 1000, y: 1000, hp: 100, hpMax: 100, level: 1, factionId: "dawn", tag: null, alive: true, characterId: "c1" }] });
    const started = harness.emit({ kind: "instanceStarted", recovered: false, checkpointRev: 0 });
    assert.deepEqual([started.effects, harness.vars()], [[], { started: true }], "startTimer / setVar 本地生效");
    const effects = harness.advance(20);
    const spawns = effects.filter((effect) => effect.op === "spawn");
    assert.equal(spawns.length, 1, "1 s 后 boss timer ⇒ spawn");
    const welcome = harness.emit({ kind: "playerEntered", entityId: "char:c1", characterId: "c1", factionId: "dawn" });
    assert.deepEqual(welcome.effects, [{ op: "sayNearby", anchorEntityId: "char:c1", text: "welcome" }]);
    const died = harness.emit({ kind: "creatureDied", entityId: "orch:greybox:1", templateId: "slime", tag: "boss", killerEntityId: "char:c1", pos: { x: 1100, y: 900 } });
    assert.deepEqual([died.effects, harness.vars().bossKills], [[{ op: "grantItem", toCharacterId: "c1", itemTemplateId: "slime-gel", count: 1, reason: "boss" }], 1], "击杀者所在队伍（自己）一件 + 计数 durable");
    const events = [
        { event: { kind: "instanceStarted", recovered: false, checkpointRev: 0 } as OrchestrationEvent, tick: 0 },
        { event: { kind: "playerEntered", entityId: "char:c1", characterId: "c1", factionId: "dawn" } as OrchestrationEvent, tick: 20 },
        { event: { kind: "creatureDied", entityId: "orch:greybox:1", templateId: "slime", tag: "boss", killerEntityId: "char:c1", pos: { x: 1100, y: 900 } } as OrchestrationEvent, tick: 20 },
    ];
    const direct = createOrchestrationHarness({ module: bossTimer, pack: GREYBOX_PACK, mapId: "greybox", seed: 7, entities: [] });
    for (const { event, tick } of events) direct.emit(event, tick);
    assert.equal(direct.replay(events).equal, true, "重放逐条相等");
    // spawn 位置经 rng：不同种子（= 不同 instanceId）下 boss timer 的落点不全相同；同种子重放一致
    const spawnXOf = (seed: number): number => {
        const h = createOrchestrationHarness({ module: bossTimer, pack: GREYBOX_PACK, mapId: "greybox", seed });
        const effect = h.emit({ kind: "timer", timerId: "bossSpawn", tag: "boss" }, 20).effects.find((entry) => entry.op === "spawn");
        return effect && effect.op === "spawn" ? effect.pos.x : -1;
    };
    const xs = [1, 2, 3, 4, 5, 6, 7, 8].map(spawnXOf);
    assert.ok(new Set(xs).size > 1, `改种子 ⇒ 落点不全相同：${xs.join(",")}`);
    assert.equal(spawnXOf(7), spawnXOf(7), "同种子同落点");
});

test("listCheckpointedVars（面 v2，MG1-B2）：按 map / pack 列分线（instance_id 序、LIMIT 64）各取最新检查点 rev / tick / 该 pack 的 vars；无检查点 ⇒ 0 / 0 / {}；检查点里是别的 pack ⇒ {}；SQL 全部过 kit 表闸", async () => {
    const queries: { readonly sql: string; readonly params: readonly unknown[] }[] = [];
    const envelopeA = JSON.stringify({ rev: 7, snapshot: { orchestration: { packId: "demoVale", vars: { bossKills: 3, ambushAt: 1200 } } } });
    const envelopeC = { rev: 2, snapshot: { orchestration: { packId: "other", vars: { bossKills: 9 } } } };
    const run: MmoTxRunner = async (sId, fn) => fn({
        sId,
        query: async (sql: string, params: unknown[] = []) => {
            queries.push({ sql, params });
            if (sql.startsWith("SELECT instance_id FROM k_mmo_instance")) return [{ instance_id: "wi_a" }, { instance_id: "wi_b" }, { instance_id: "wi_c" }];
            if (params[1] === "wi_a") return [{ rev: "7", tick: "1400", envelope: envelopeA }];
            if (params[1] === "wi_c") return [{ rev: 2, tick: 10, envelope: envelopeC }];
            return [];
        },
    } as unknown as KitTx);
    const rows = await listCheckpointedVars(0, "demoVale", "demoVale", run);
    assert.deepEqual(rows, [
        { instanceId: "wi_a", rev: 7, tick: 1400, vars: { bossKills: 3, ambushAt: 1200 } },
        { instanceId: "wi_b", rev: 0, tick: 0, vars: {} },
        { instanceId: "wi_c", rev: 2, tick: 10, vars: {} },
    ]);
    assert.deepEqual(queries[0]!.params, [0, "demoVale", "demoVale", CHECKPOINTED_VARS_MAX_ROWS], "分线清单按 sId / map / pack 过滤且有界");
    assert.equal(queries.length, 4, "1 条清单 + 每分线 1 条最新检查点");
    for (const { sql } of queries) assert.doesNotThrow(() => assertKitTableAccess(sql, "mmo"), sql);
    const none = await listCheckpointedVars(0, "greybox", "greybox", async (sId, fn) => fn({ sId, query: async () => [] } as unknown as KitTx));
    assert.deepEqual(none, []);
});
