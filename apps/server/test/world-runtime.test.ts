/**
 * MMO MF4-B5 无头 WorldRuntime + WorldMode 契约（docs/MMO.md §4.5 / §4.6-5；假时钟、无 Colyseus 进程）：
 *  - 状态机 Recovering → Active → Draining → Offline：recover 只能一次、准入只在 Active、Draining 拒新命令 / 准入但仍推进；
 *  - 命令队列：同 tick 有序、逐步排空、离座的命令被清、陌生命令 / 未在座拒；
 *  - 固定步累积 + catch-up 上限（自 GameRoom 抽出）：极端 dt 只补上限步、backlog 丢弃；
 *  - 空实例三策略：sleep 停步（准入唤醒、⛔ 不重放）/ unload 走 Draining → Offline / run 照常；检查点节拍；
 *  - mode 钩子抛错不杀循环；registry 契约闸。
 * 变异验证：删 catch-up 上限 → 「极端 dt 只补上限步」转红；sleep 策略不停步 → 「睡眠零步」转红；enqueue 不看 phase → 「Draining 拒命令」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { WorldPhase, defineS2C, type GameplayS2CToken } from "@game/shared";
import { WorldRuntime, type WorldCheckpointBatch } from "../src/rooms/core/WorldRuntime";
import { MemoryCheckpointPort, buildCheckpointEnvelope } from "../src/rooms/core/CheckpointPort";
import {
    WorldModeRegistry, assertWorldModeContract, type WorldCheckpoint, type WorldCommand, type WorldMode, type WorldModeContext, type WorldStateLifecycle,
} from "../src/rooms/WorldMode";
import type { WorldManifestConfig } from "../tools/gameplay-codegen/manifestSchema";

interface FxState extends WorldStateLifecycle { revision: number }
const identity = (input: unknown): Record<string, unknown> => input as Record<string, unknown>;
const Tick = defineS2C("s2c.fx.tick", identity, { perSession: true });
const Notice = defineS2C("s2c.fx.notice", identity);

function freshState(): FxState {
    return { tick: 0, phase: WorldPhase.Offline, instanceId: "", mapId: "", line: 0, authorityEpoch: 0, revision: 0 };
}

interface Harness {
    readonly runtime: WorldRuntime<FxState>;
    readonly batches: WorldCheckpointBatch[];
    readonly state: FxState;
    readonly log: string[];
    readonly steps: (readonly WorldCommand[])[];
    readonly sent: { session: string; type: string; payload: unknown }[];
    clock: number;
    readonly mode: WorldMode<FxState>;
}

function harness(options: { world?: Partial<WorldManifestConfig>; capacity?: number; maxCatchUpSteps?: number; stepThrows?: boolean; admit?: (request: { personaId: string }) => boolean; checkpoint?: boolean } = {}): Harness {
    const log: string[] = [];
    const batches: WorldCheckpointBatch[] = [];
    const steps: (readonly WorldCommand[])[] = [];
    const sent: { session: string; type: string; payload: unknown }[] = [];
    const state = freshState();
    let clockRef = { value: 1_000 };
    const mode: WorldMode<FxState> = {
        id: "fx",
        capacity: options.capacity ?? 2,
        commands: ["c2s.fx.move"],
        onWorldInit(_context, info) { log.push(`init:${info.recovered}`); },
        onRestore(_context, snapshot) { log.push(`restore:${JSON.stringify(snapshot.instance)}`); },
        onAdmit(_context, request) { log.push(`admit:${request.personaId}`); return options.admit ? options.admit(request) : true; },
        onEnter(_context, session) { log.push(`enter:${session.session}`); },
        onLeave(_context, session, reason) { log.push(`leave:${session.session}:${reason}`); },
        onStep(context: WorldModeContext<FxState>, step) {
            steps.push(step.commands);
            context.state.revision += 1;
            if (options.stepThrows) throw new Error("boom");
            for (const command of step.commands) context.sendS2C(command.session, Tick, { seq: step.tick });
        },
        onCheckpoint(context): WorldCheckpoint { log.push(`checkpoint:${context.state.tick}`); return { persona: [], instance: { tick: context.state.tick } }; },
        onDrain(_context, info) { log.push(`drain:${info.reason}`); },
        onSignal(_context, signal) { log.push(`signal:${signal.kind}`); },
        primaryEntityOf: (session) => `ent-${session}`,
        ...(options.checkpoint ? { checkpoint: { kitId: "kfix", port: new MemoryCheckpointPort(), schema: { version: 1, minSupported: 1 }, eventTable: "k_kfix_event" } } : {}),
    };
    const runtime = new WorldRuntime<FxState>({
        mode, state, sId: 0, fixedStepMs: 50, seed: 7, now: () => clockRef.value,
        world: { emptyPolicy: "sleep", emptyAfterMs: 1_000, checkpointMs: 500, ...(options.world ?? {}) },
        ports: {
            sendS2C: (session, token, payload) => { sent.push({ session, type: token.type, payload }); },
            broadcastS2C: (token, payload) => { sent.push({ session: "*", type: token.type, payload }); },
            onCheckpoint: (batch) => { batches.push(batch); },
        },
        ...(options.maxCatchUpSteps === undefined ? {} : { maxCatchUpSteps: options.maxCatchUpSteps }),
    });
    const result: Harness = { runtime, batches, state, log, steps, sent, mode, get clock() { return clockRef.value; }, set clock(value: number) { clockRef.value = value; } };
    return result;
}
const request = (session: string, personaId = `p-${session}`) =>
    ({ session, userId: `u-${session}`, personaId, controlEpoch: 1, ticketSha256: "x".repeat(64), resumeSeq: null, checkpoint: null });

test("状态机：Recovering 拒准入 / 命令；recover 一次到 Active（含 onRestore）；Draining 拒准入与命令但仍推进；Offline 清空会话", async () => {
    const h = harness();
    assert.equal(h.runtime.phase, WorldPhase.Recovering);
    assert.equal(h.runtime.admit(request("a")), "not-active");
    assert.equal(h.runtime.enqueue("a", "c2s.fx.move", {}), "rejected");
    await assert.rejects(h.runtime.recover({ instanceId: "i1", mapId: "m1", line: 0, authorityEpoch: 0, checkpoint: null }), RangeError, "authorityEpoch 必须先取权威");
    await h.runtime.recover({ instanceId: "i1", mapId: "m1", line: 2, authorityEpoch: 3, checkpoint: buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 3, schemaVersion: 1, snapshot: { tick: 9 } }) });
    assert.equal(h.runtime.phase, WorldPhase.Active);
    assert.deepEqual([h.state.instanceId, h.state.mapId, h.state.line, h.state.authorityEpoch], ["i1", "m1", 2, 3]);
    assert.deepEqual(h.log, ["init:true", "restore:{\"tick\":9}"]);
    await assert.rejects(h.runtime.recover({ instanceId: "i1", mapId: "m1", line: 2, authorityEpoch: 3, checkpoint: null }), /只能在 Recovering/u);
    assert.equal(h.runtime.admit(request("a")), "admitted");
    h.runtime.drain("gm", 100);
    assert.equal(h.runtime.phase, WorldPhase.Draining);
    assert.equal(h.runtime.admit(request("b")), "draining");
    assert.equal(h.runtime.enqueue("a", "c2s.fx.move", {}), "rejected", "Draining 拒新命令");
    assert.equal(h.runtime.advance(100), 2, "Draining 仍推进（在途交接 / 强制检查点由壳编排）");
    assert.ok(h.runtime.takeCheckpoint(true), "Draining 可强制检查点");
    h.runtime.drain("again", 0);
    assert.equal(h.log.filter((entry) => entry.startsWith("drain:")).length, 1, "drain 幂等");
    h.runtime.offline();
    assert.equal(h.runtime.phase, WorldPhase.Offline);
    assert.deepEqual(h.runtime.sessions(), []);
    assert.ok(h.log.includes("leave:a:drained"));
    assert.equal(h.runtime.advance(1_000), 0, "Offline 不推进");
});

test("准入：容量 / 重复会话 / 同 persona 双登 / mode 拒；离座清其命令；命令同 tick 有序逐步排空；陌生命令拒", async () => {
    const h = harness({ capacity: 2, admit: (r) => r.personaId !== "banned" });
    await h.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    assert.equal(h.runtime.admit(request("a")), "admitted");
    assert.equal(h.runtime.admit(request("a")), "duplicate");
    assert.equal(h.runtime.admit(request("a2", "p-a")), "duplicate", "同 persona 只一个控制");
    assert.equal(h.runtime.admit(request("x", "banned")), "refused");
    assert.equal(h.runtime.admit(request("b")), "admitted");
    assert.equal(h.runtime.admit(request("c")), "full");
    assert.equal(h.runtime.enqueue("a", "c2s.fx.move", { n: 1 }), "queued");
    assert.equal(h.runtime.enqueue("b", "c2s.fx.move", { n: 2 }), "queued");
    assert.equal(h.runtime.enqueue("a", "c2s.fx.move", { n: 3 }), "queued");
    assert.equal(h.runtime.enqueue("a", "c2s.fx.teleport", {}), "rejected", "陌生命令");
    assert.equal(h.runtime.enqueue("z", "c2s.fx.move", {}), "rejected", "未在座");
    assert.equal(h.runtime.pendingCommands, 3);
    h.runtime.stepOnce();
    assert.deepEqual(h.steps[0]?.map((command) => [command.session, (command.payload as { n: number }).n]), [["a", 1], ["b", 2], ["a", 3]], "同 tick 有序");
    assert.equal(h.runtime.pendingCommands, 0);
    assert.deepEqual(h.sent.map((entry) => entry.session), ["a", "b", "a"], "出站经 ports");
    h.runtime.enqueue("b", "c2s.fx.move", { n: 4 });
    assert.equal(h.runtime.leave("b", "left"), true);
    assert.equal(h.runtime.pendingCommands, 0, "离座清其未处理命令");
    assert.equal(h.runtime.leave("b", "left"), false);
    h.runtime.stepOnce();
    assert.deepEqual(h.steps[1], []);
    assert.equal(h.runtime.primaryEntityOf("a"), "ent-a");
    h.runtime.signal("gm", { x: 1 });
    assert.ok(h.log.includes("signal:gm"));
});

test("固定步累积 + catch-up 上限：小 dt 不推进、整步推进、极端 dt 只补上限步且丢弃 backlog；mode.onStep 抛错不杀循环", async () => {
    const h = harness({ maxCatchUpSteps: 4 });
    await h.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    assert.equal(h.runtime.admit(request("a")), "admitted");
    assert.equal(h.runtime.advance(30), 0);
    assert.equal(h.runtime.advance(30), 1, "累积到 60 ⇒ 一步，余 10");
    assert.equal(h.state.tick, 1);
    assert.equal(h.runtime.advance(100), 2);
    assert.equal(h.runtime.advance(1e9), 4, "极端 dt 只补 maxCatchUpSteps 步");
    assert.equal(h.runtime.advance(Number.POSITIVE_INFINITY), 0, "非有限 dt 直接忽略（与 GameRoom.update 同口径）");
    assert.equal(h.runtime.advance(0), 0);
    assert.equal(h.runtime.advance(50), 1, "backlog 已丢弃：下一次正常一步（⛔ 不是继续补）");
    assert.equal(h.runtime.advance(-5), 0);
    const throwing = harness({ stepThrows: true });
    await throwing.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    throwing.runtime.admit(request("a"));
    const originalError = console.error;
    console.error = () => {};
    try {
        assert.equal(throwing.runtime.advance(100), 2, "钩子抛错照样推进两步");
    } finally {
        console.error = originalError;
    }
    assert.equal(throwing.state.tick, 2);
});

test("空实例策略：sleep 停步、准入唤醒且 ⛔ 不重放；unload ⇒ Draining → Offline；run 照常推进；检查点按 checkpointMs 节拍", async () => {
    const sleep = harness({ world: { emptyPolicy: "sleep", emptyAfterMs: 1_000 } });
    await sleep.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    assert.equal(sleep.runtime.admit(request("a")), "admitted");
    sleep.runtime.leave("a", "left");
    sleep.clock += 999;
    assert.equal(sleep.runtime.evaluateEmpty(), "none", "未到 emptyAfterMs");
    assert.equal(sleep.runtime.advance(100), 2);
    sleep.clock += 1;
    assert.equal(sleep.runtime.evaluateEmpty(), "slept");
    assert.equal(sleep.runtime.isSleeping, true);
    assert.equal(sleep.runtime.advance(10_000), 0, "睡眠零步");
    assert.equal(sleep.runtime.evaluateEmpty(), "none", "已睡不重复");
    const tickBefore = sleep.state.tick;
    assert.equal(sleep.runtime.admit(request("b")), "admitted");
    assert.equal(sleep.runtime.isSleeping, false, "准入唤醒");
    assert.equal(sleep.runtime.advance(100), 2, "续跑");
    assert.equal(sleep.state.tick, tickBefore + 2, "⛔ 不重放睡眠期间的步");

    const unload = harness({ world: { emptyPolicy: "unload", emptyAfterMs: 500 } });
    await unload.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    unload.runtime.admit(request("a"));
    unload.runtime.leave("a", "left");
    unload.clock += 500;
    assert.equal(unload.runtime.evaluateEmpty(), "unloaded");
    assert.equal(unload.runtime.phase, WorldPhase.Offline);
    assert.ok(unload.log.includes("drain:empty-unload"));

    const run = harness({ world: { emptyPolicy: "run", emptyAfterMs: 100, checkpointMs: 500 } });
    await run.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    assert.equal(run.runtime.takeCheckpoint(), null, "刚 recover：未到节拍");
    run.clock += 10_000;
    assert.equal(run.runtime.evaluateEmpty(), "none");
    assert.equal(run.runtime.advance(100), 2, "run：空实例照常推进");
    assert.deepEqual(run.batches.map((batch) => batch.checkpoint), [{ persona: [], instance: { tick: 2 } }], "到节拍即经落点取一批（advance 末尾）");
    assert.equal(run.runtime.takeCheckpoint(), null, "取过即重置节拍");
    run.clock += 499;
    assert.equal(run.runtime.takeCheckpoint(), null);
    run.clock += 1;
    assert.deepEqual(run.runtime.takeCheckpoint(), { persona: [], instance: { tick: 2 } });
    assert.deepEqual(run.runtime.takeCheckpoint(true), { persona: [], instance: { tick: 2 } }, "强制不看节拍");
    // 从未准入过的实例：recover 起算空实例计时
    const never = harness({ world: { emptyPolicy: "sleep", emptyAfterMs: 100 } });
    await never.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    never.clock += 100;
    assert.equal(never.runtime.evaluateEmpty(), "slept");
});

test("context.requestDrain 走同一状态机（缺省直接 drain；壳可接管）；全房 / 按会话出站分流；registry 契约闸", async () => {
    const h = harness();
    await h.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    h.runtime.context().broadcastS2C(Notice as GameplayS2CToken<unknown>, { text: "hi" });
    assert.deepEqual(h.sent[h.sent.length - 1], { session: "*", type: "s2c.fx.notice", payload: { text: "hi" } });
    h.runtime.context().requestDrain("gm");
    assert.equal(h.runtime.phase, WorldPhase.Draining);
    const registry = new WorldModeRegistry();
    const off = registry.register("fx", () => h.mode);
    assert.equal(registry.create("fx").id, "fx");
    assert.throws(() => registry.register("fx", () => h.mode), /重复登记/u);
    off();
    assert.equal(registry.has("fx"), false);
    registry.register("bad", () => ({ ...h.mode, id: "bad", capacity: 0 } as WorldMode));
    assert.throws(() => registry.create("bad"), /capacity 必须是 1\.\.1024/u);
    assert.throws(() => assertWorldModeContract({ ...h.mode, commands: ["move"] }, "fx"), /c2s\.\* 消息名数组/u);
    assert.throws(() => assertWorldModeContract({ id: "fx", capacity: 1, commands: [] }, "fx"), /必须实现 onWorldInit 与 onStep/u);
});

test("MF7b：durable 事件缓冲与检查点批（rev = 已落库 + 1、事件提交前保留、commit 只许前进 / rollback 不丢）、requestCheckpoint 强制点、recover 带信封续 rev / eventSeq；无能力 fail-closed", async () => {
    const plain = harness();
    await plain.runtime.recover({ instanceId: "i", mapId: "m", line: 0, authorityEpoch: 1, checkpoint: null });
    assert.throws(() => plain.runtime.context().events.append("grant", {}), /eventTable/u, "无 eventTable ⛔ 追加事件");
    assert.throws(() => plain.runtime.context().requestCheckpoint("x"), /checkpoint 能力/u);
    const h = harness({ checkpoint: true, world: { checkpointMs: 500 } });
    await h.runtime.recover({
        instanceId: "i", mapId: "m", line: 0, authorityEpoch: 2,
        checkpoint: buildCheckpointEnvelope({ rev: 4, eventOffset: 10, authorityEpoch: 1, schemaVersion: 1, snapshot: { tick: 3 } }),
    });
    assert.deepEqual([h.runtime.checkpointRevision, h.runtime.lastEventSeq], [4, 10], "Recovering 从信封续 rev / eventOffset");
    assert.ok(h.log.includes("restore:{\"tick\":3}"));
    assert.equal(h.runtime.admit(request("a")), "admitted");
    const context = h.runtime.context();
    assert.equal(context.events.append("grant", { amount: 1 }), 11);
    assert.throws(() => context.events.append("bad kind!", {}), TypeError);
    assert.equal(context.events.append("grant", { amount: 2 }), 12);
    assert.equal(h.runtime.pendingEventCount, 2);
    h.clock += 10_000;
    h.runtime.advance(50);
    assert.equal(h.batches.length, 1, "到节拍 ⇒ 一批");
    const first = h.batches[0]!;
    assert.deepEqual([first.rev, first.eventOffset, first.authorityEpoch, first.reason], [5, 12, 2, "periodic"]);
    assert.deepEqual(first.events.map((event) => [event.seq, event.kind]), [[11, "grant"], [12, "grant"]]);
    assert.deepEqual(first.personas, [{ personaId: "p-a", controlEpoch: 1 }]);
    assert.equal(h.runtime.pendingEventCount, 2, "在途事件保留到提交成功，后继批才能覆盖失败前缀");
    assert.equal(h.runtime.checkpointRevision, 4, "⛔ 未 commit 不推进");
    h.runtime.rollbackCheckpoint(first);
    assert.equal(h.runtime.pendingEventCount, 2, "落盘失败 ⇒ 事件仍保留");
    context.requestCheckpoint("loot");
    h.runtime.advance(50);
    assert.equal(h.batches.length, 2, "强制点：本步末尾立即取");
    assert.deepEqual([h.batches[1]!.rev, h.batches[1]!.reason, h.batches[1]!.events.length], [6, "loot", 2], "rev 不重用作废的号");
    assert.equal(context.events.append("grant", { amount: 3 }), 13, "批次捕获之后产生的新事件不属于 rev 6");
    h.runtime.commitCheckpoint(6);
    assert.equal(h.runtime.pendingEventCount, 1, "只在提交后移除已耐久前缀，保留批次之后的新事件");
    assert.equal(h.runtime.checkpointRevision, 6);
    h.runtime.commitCheckpoint(5);
    assert.equal(h.runtime.checkpointRevision, 6, "只许前进");
    h.runtime.advance(50);
    assert.equal(h.batches.length, 2, "未到节拍且无强制点 ⇒ 不取");
    assert.equal(h.runtime.forceCheckpoint("drain"), true);
    assert.deepEqual([h.batches[2]!.rev, h.batches[2]!.reason, h.batches[2]!.events.map((event) => event.seq)], [7, "drain", [13]]);
    assert.equal(h.batches[2]!.eventOffset, 13, "eventOffset = 最后分配的 seq");
});
