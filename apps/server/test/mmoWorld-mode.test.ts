/**
 * mmoWorld 服务端 WorldMode（MK0-B3，无头：WorldRuntime 直驱，⛔ Colyseus / DB）：
 *  - onWorldInit 按内容包为本图撒怪（三只 slime，确定性抖动在 spawn 附近）；图不在包内 ⇒ recover 拒；
 *  - onBeforeAdmit 预热角色行 → onAdmit：有角色放行、无角色拒；onEnter 落出生点或 persona 检查点位置（同图才回灌）；
 *  - move dir ⇒ 常量速度积分（120 × 0.05 = 6 / 步）并钳图；target ⇒ 直奔并到达停下；停下不再前进；
 *  - 视野流：首个 baseline = 本人 + 三只 slime；update 只在位置变时；本人私有流 hp / mp 一次；pickup / transfer ⇒ opResult rejected；
 *  - onCheckpoint：persona 快照 {mapId, x, y, hp, mp}、分线快照 creatures；onRestore 回灌怪物位置；
 *  - MK1-B1 movement 面：速度 / HP / MP 取内容包职业模板（caster 110 / 80 / 100）；本人每步收直发 `s2c.mmoWorld.pos`（seq = 最新意图；停下那步回执一次，之后不动不回）；
 *    撞灰盒墙停下并清目标；职业不在内容包 ⇒ 准入拒；
 *  - MK1-B2 AOI 接入：候选来自 kit 网格、精确视距 + 规则（位面 / 隐身 × 阵营）、最近优先截到 MMO_INTEREST_MAX_ENTITIES；超视野零泄露（远处角色的 id 不出现在任何出站）、
 *    走进视距 enter 恰一次、隐身只对同阵营可见、位面隔离、300 只挤在出生点也不触发框架 InterestSet 上限。
 * 变异验证（改哪一行 → 哪条用例转红）：mode 撒怪 count 循环改为 1 → 「三只 slime」红；onEnter 不看 restored.mapId → 「异图检查点不回灌」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S, S2C, WorldPhase, type IMmoEntityWire, type IMmoWorldBaselineChunk, type IMmoWorldEnter, type IMmoWorldLeave, type IMmoWorldOpResult, type IMmoWorldPos, type IMmoWorldPrivate, type IMmoWorldUpdate,
} from "@game/shared";
import { indexContentPack, validateContentPack, type IContentPack, type IContentPackIndex } from "@game/shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import type { MmoClassId, MmoFactionId } from "@game/shared/kits/mmo/api/characters/index";
import type { MmoCharacterRow } from "../src/kits/mmo/api/characters/index";
import { buildCheckpointEnvelope } from "../src/rooms/core/CheckpointPort";
import { WorldRuntime, type WorldCheckpointBatch } from "../src/rooms/core/WorldRuntime";
import { MMO_INTEREST_MAX_ENTITIES, createMmoWorldMode, type MmoWorldMode } from "../src/rooms/modes/mmoWorld/index";
import { createRoomStateForMode, type MmoWorldRoomState } from "../src/rooms/schema/GameRoomState";
import type { MmoInstanceSnapshot, MmoPersonaSnapshot } from "../src/rooms/modes/mmoWorld/checkpoint";

const CONTENT = indexContentPack(validateContentPack(GREYBOX_PACK));
const rowOf = (personaId: string, name = "Rook", classId: MmoClassId = "fighter", factionId: MmoFactionId = "dawn"): MmoCharacterRow => ({
    characterId: `c-${personaId}`, personaId, userId: `u-${personaId}`, slot: 0, name, classId, factionId, level: 1, exp: 0, checkpointRev: 0, mapId: null,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type MutablePack = { -readonly [K in keyof IContentPack]: IContentPack[K] };

interface Harness {
    readonly mode: MmoWorldMode;
    readonly runtime: WorldRuntime<MmoWorldRoomState>;
    readonly state: MmoWorldRoomState;
    readonly characters: Map<string, MmoCharacterRow>;
    readonly direct: { session: string; type: string; payload: unknown }[];
    readonly batches: WorldCheckpointBatch[];
    clock: number;
}

function harness(content: IContentPackIndex = CONTENT): Harness {
    const characters = new Map<string, MmoCharacterRow>();
    const mode = createMmoWorldMode({ content, loadCharacter: async (_sId, personaId) => characters.get(personaId) ?? null, checkpoint: null });
    const state = createRoomStateForMode("mmoWorld") as MmoWorldRoomState;
    const direct: Harness["direct"] = [];
    const batches: WorldCheckpointBatch[] = [];
    const clockRef = { value: 0 };
    const runtime = new WorldRuntime<MmoWorldRoomState>({
        mode, state, sId: 0, fixedStepMs: 50, seed: 7, now: () => clockRef.value,
        world: { emptyPolicy: "run", emptyAfterMs: 100_000, checkpointMs: 100_000 },
        ports: {
            sendS2C: (session, token, payload) => { direct.push({ session, type: token.type, payload }); },
            broadcastS2C: (token, payload) => { direct.push({ session: "*", type: token.type, payload }); },
            onCheckpoint: (batch) => { batches.push(batch); },
        },
    });
    return { mode, runtime, state, characters, direct, batches, get clock() { return clockRef.value; }, set clock(value: number) { clockRef.value = value; } };
}

const request = (session: string, personaId: string, checkpoint: ReturnType<typeof buildCheckpointEnvelope> | null = null) =>
    ({ session, userId: `u-${personaId}`, personaId, controlEpoch: 1, ticketSha256: "x".repeat(64), resumeSeq: null, checkpoint });

async function activeWorld(h: Harness, mapId = "greybox", instanceSnapshot: MmoInstanceSnapshot | null = null): Promise<void> {
    await h.runtime.recover({
        instanceId: "i1", mapId, line: 0, authorityEpoch: 1,
        checkpoint: instanceSnapshot ? buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 1, schemaVersion: 1, snapshot: instanceSnapshot }) : null,
    });
    assert.equal(h.runtime.phase, WorldPhase.Active);
}

async function seat(h: Harness, session: string, personaId: string, checkpoint: ReturnType<typeof buildCheckpointEnvelope> | null = null, factionId: MmoFactionId = "dawn"): Promise<void> {
    h.characters.set(personaId, rowOf(personaId, "Rook", "fighter", factionId));
    const req = request(session, personaId, checkpoint);
    await h.runtime.beforeAdmit(req);
    assert.equal(h.runtime.admit(req), "admitted");
}

const step = (h: Harness, count = 1): void => { for (let index = 0; index < count; index += 1) { h.clock += 50; h.runtime.advance(50); } };
const drain = (h: Harness, session: string) => h.runtime.drainOutbound(session).map((message) => ({ type: message.token.type, payload: message.payload }));
const baselineItems = (messages: readonly { type: string; payload: unknown }[]): IMmoEntityWire[] =>
    messages.filter((message) => message.type === S2C.MmoWorldBaselineChunk).flatMap((message) => (message.payload as IMmoWorldBaselineChunk).items);

test("撒怪：本图三只 slime 落在 spawn 附近（确定性）；图不在包内 ⇒ recover 拒；无角色的 persona 准入拒", async () => {
    const h = harness();
    await activeWorld(h);
    const creatures = [...h.mode.__probe.entities().values()].filter((entity) => entity.kind === "creature");
    assert.equal(creatures.length, 3);
    for (const creature of creatures) {
        assert.ok(Math.abs(creature.x - 1200) <= 40 && Math.abs(creature.y - 1000) <= 40, `${creature.id} 在 spawn 抖动半径内 (${creature.x}, ${creature.y})`);
        assert.deepEqual([creature.templateId, creature.hp, creature.hpMax], ["slime", 30, 30]);
    }
    assert.deepEqual([h.state.packId, h.state.packVersion, h.state.population], ["greybox", 2, 0]);
    const other = harness();
    await assert.rejects(other.runtime.recover({ instanceId: "i2", mapId: "nowhere", line: 0, authorityEpoch: 1, checkpoint: null }), /不在内容包/u);
    const req = request("s0", "p-nobody");
    await h.runtime.beforeAdmit(req);
    assert.equal(h.runtime.admit(req), "refused", "无角色行 ⇒ 拒");
});

test("进图 / 走路 / 视野流：首个 baseline = 本人 + 三只 slime；dir 每步 6 单位；target 直奔到达；停下不再动；私有流一次；pickup ⇒ rejected", async () => {
    const h = harness();
    await activeWorld(h);
    await seat(h, "a", "p-a");
    step(h);
    const first = drain(h, "a");
    const items = baselineItems(first);
    assert.equal(items.length, 4, "本人 + 三只 slime");
    const self = items.find((item) => item.kind === "character");
    assert.ok(self && self.id === "char:c-p-a" && self.name === "Rook" && self.x === 1000 && self.y === 1000, JSON.stringify(self));
    const privates = first.filter((message) => message.type === S2C.MmoWorldPrivate).map((message) => message.payload as IMmoWorldPrivate);
    assert.equal(privates.length, 1, "私有流一次");
    assert.deepEqual([privates[0]!.hp, privates[0]!.hpMax, privates[0]!.mp, privates[0]!.mpMax], [100, 100, 50, 50]);
    assert.equal(h.state.population, 1);

    assert.equal(h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } }), "queued");
    step(h, 2);
    const updates = drain(h, "a").filter((message) => message.type === S2C.MmoWorldUpdate).map((message) => message.payload as IMmoWorldUpdate);
    assert.deepEqual(updates.map((update) => [update.id, update.x, update.y]), [["char:c-p-a", 1012, 1000]], "两步 × 6 单位，合并后一条");
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
    step(h, 2);
    assert.equal(drain(h, "a").filter((message) => message.type === S2C.MmoWorldUpdate).length, 0, "停下 ⇒ 无 update");
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 3, target: { x: 1015, y: 1004 } });
    step(h, 3);
    const mover = h.mode.__probe.moverOf("a")!;
    assert.deepEqual([mover.x, mover.y, mover.target], [1015, 1004, null], "点地：5 单位内一步到达并清目标");
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: "loot:1", clientReqId: "c1" });
    step(h);
    const results = h.direct.filter((message) => message.type === S2C.MmoWorldOpResult).map((message) => message.payload as IMmoWorldOpResult);
    assert.deepEqual(results.map((result) => [result.clientReqId, result.result]), [["c1", "rejected"]]);
});

test("检查点：persona 快照 {mapId,x,y,hp,mp} + 分线 creatures；onRestore 回灌怪物位置；onEnter 只回灌同图检查点", async () => {
    const h = harness();
    await activeWorld(h);
    await seat(h, "a", "p-a");
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, dir: { x: 0, y: -1 } });
    step(h, 2);
    const checkpoint = h.runtime.takeCheckpoint(true)!;
    const persona = checkpoint.persona[0]!.snapshot as MmoPersonaSnapshot;
    assert.deepEqual(persona, { mapId: "greybox", x: 1000, y: 988, hp: 100, mp: 50 });
    const instance = checkpoint.instance as MmoInstanceSnapshot;
    assert.deepEqual([instance.mapId, instance.packId, instance.creatures.length], ["greybox", "greybox", 3]);

    // 恢复：怪物按快照位置回灌（挪一只到 (1300, 900)）
    const moved = { ...instance, creatures: instance.creatures.map((creature, index) => (index === 0 ? { ...creature, x: 1300, y: 900, hp: 5 } : creature)) };
    const recovered = harness();
    await activeWorld(recovered, "greybox", moved);
    const restored = recovered.mode.__probe.entities().get(instance.creatures[0]!.id)!;
    assert.deepEqual([restored.x, restored.y, restored.hp], [1300, 900, 5]);
    assert.ok(recovered.mode.__probe.log.includes("restore:3"));

    // 同图 persona 检查点回灌；异图 ⇒ 出生点
    const sameMap = buildCheckpointEnvelope({ rev: 3, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 1, snapshot: { mapId: "greybox", x: 1500, y: 700, hp: 40, mp: 10 } satisfies MmoPersonaSnapshot });
    await seat(recovered, "a", "p-a", sameMap);
    const moverA = recovered.mode.__probe.moverOf("a")!;
    assert.deepEqual([moverA.x, moverA.y, moverA.hp, moverA.mp], [1500, 700, 40, 10]);
    const otherMap = buildCheckpointEnvelope({ rev: 3, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 1, snapshot: { mapId: "elsewhere", x: 1500, y: 700, hp: 40, mp: 10 } satisfies MmoPersonaSnapshot });
    await seat(recovered, "b", "p-b", otherMap);
    const moverB = recovered.mode.__probe.moverOf("b")!;
    assert.deepEqual([moverB.x, moverB.y], [1000, 1000], "异图检查点不回灌位置");
});

test("movement 面：caster 每步 5.5 单位（职业模板）；本人每步收直发 pos 回执（seq = 最新意图，⛔ 观察者单流）；停下回执一次后静默；撞墙停下清目标；职业不在包 ⇒ 准入拒", async () => {
    const h = harness();
    await activeWorld(h);
    h.characters.set("p-c", rowOf("p-c", "Mage", "caster"));
    const reqC = request("c", "p-c");
    await h.runtime.beforeAdmit(reqC);
    assert.equal(h.runtime.admit(reqC), "admitted");
    step(h);
    const first = drain(h, "c");
    const privates = first.filter((message) => message.type === S2C.MmoWorldPrivate).map((message) => message.payload as IMmoWorldPrivate);
    assert.deepEqual([privates[0]!.hpMax, privates[0]!.mpMax], [80, 100], "职业模板的 HP / MP");
    const posOf = (session: string) => h.direct.filter((message) => message.session === session && message.type === S2C.MmoWorldPos).map((message) => message.payload as IMmoWorldPos);
    assert.equal(posOf("c").length, 0, "没意图没移动 ⇒ 无回执");
    h.runtime.enqueue("c", C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } });
    step(h, 2);
    assert.deepEqual(posOf("c").map((pos) => [pos.seq, pos.x, pos.y]), [[1, 1005.5, 1000], [1, 1011, 1000]], "每步一条，seq = 意图 seq，110 × 0.05 = 5.5");
    assert.ok(posOf("c").every((pos) => pos.tick > 0));
    assert.equal(drain(h, "c").filter((message) => message.type === S2C.MmoWorldPos).length, 0, "pos 直发，⛔ 进观察者单流");
    h.runtime.enqueue("c", C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
    step(h, 3);
    assert.deepEqual(posOf("c").slice(2).map((pos) => [pos.seq, pos.x]), [[2, 1011]], "停：意图那步回执一次（seq 2），之后不动不回");

    // 撞墙：从检查点 (1490, 1000) 点地 (1600, 1000)——1496 之后下一步 1502 落墙（x ∈ [1500, 1700)）⇒ 停、清目标
    const nearWall = buildCheckpointEnvelope({ rev: 3, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 1, snapshot: { mapId: "greybox", x: 1490, y: 1000, hp: 100, mp: 50 } satisfies MmoPersonaSnapshot });
    await seat(h, "w", "p-w", nearWall);
    h.runtime.enqueue("w", C2S.MmoWorldMove, { seq: 1, target: { x: 1600, y: 1000 } });
    step(h, 5);
    const mover = h.mode.__probe.moverOf("w")!;
    assert.deepEqual([mover.x, mover.y, mover.target], [1496, 1000, null], "撞墙原地并清目标（⛔ 空转）");
    assert.deepEqual(posOf("w").map((pos) => pos.x), [1496], "只有真动的那步回执");

    // 职业模板不在内容包 ⇒ 准入拒
    h.characters.set("p-x", rowOf("p-x", "Pal", "paladin" as MmoClassId)); // 枚举外的存量职业（内容包换版）
    const reqX = request("x", "p-x");
    await h.runtime.beforeAdmit(reqX);
    assert.equal(h.runtime.admit(reqX), "refused", "职业不在内容包 ⇒ 拒");
});

const personaAt = (x: number, y: number) =>
    buildCheckpointEnvelope({ rev: 3, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 1, snapshot: { mapId: "greybox", x, y, hp: 100, mp: 50 } satisfies MmoPersonaSnapshot });
const idsOf = (messages: readonly { type: string; payload: unknown }[], type: string): string[] =>
    messages.filter((message) => message.type === type).map((message) => (type === S2C.MmoWorldEnter ? (message.payload as IMmoWorldEnter).entity.id : (message.payload as IMmoWorldLeave).id));
const mentions = (messages: readonly { type: string; payload: unknown }[], id: string): number => messages.filter((message) => JSON.stringify(message.payload).includes(`"${id}"`)).length;

test("AOI 接入：超视野零泄露；走进视距 enter 恰一次（第 84 步）；名片带阵营；隐身只对同阵营可见；位面隔离；本人永远看得见自己", async () => {
    const h = harness();
    await activeWorld(h);
    const idA = "char:c-p-a";
    const idB = "char:c-p-b";
    const idC = "char:c-p-c";
    await seat(h, "a", "p-a"); // dawn @ 出生点 (1000, 1000)
    await seat(h, "b", "p-b", personaAt(1000, 1900), "dusk"); // 900 单位外
    step(h);
    const firstA = drain(h, "a");
    const firstB = drain(h, "b");
    assert.equal(mentions(firstA, idB), 0, "零泄露：A 的任何出站都不含 900 单位外的 B");
    assert.equal(mentions(firstB, idA), 0, "零泄露：B 的任何出站都不含 A");
    assert.deepEqual(baselineItems(firstB).map((item) => item.id), [idB], "B 的 baseline 只有自己（slime 在 860 单位外）");
    assert.equal(baselineItems(firstA).find((item) => item.id === idA)?.factionId, "dawn", "名片带阵营");
    assert.equal(baselineItems(firstA).find((item) => item.kind === "creature")?.factionId, undefined, "怪物无阵营字段（exact keys）");

    // B 向南走：900 → ≤ 400 要 84 步（每步 6）
    h.runtime.enqueue("b", C2S.MmoWorldMove, { seq: 1, dir: { x: 0, y: -1 } });
    step(h, 83);
    assert.equal(mentions(drain(h, "a"), idB), 0, "83 步后距离 402：仍不可见");
    step(h, 2);
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldEnter), [idB], "进入视距 enter 恰一次");
    assert.ok(idsOf(drain(h, "b"), S2C.MmoWorldEnter).includes(idA), "B 也看到 A");
    h.runtime.enqueue("b", C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
    step(h);
    drain(h, "a");
    drain(h, "b");

    // 隐身：B（dusk）隐身 ⇒ A（dawn）收 leave；同阵营 C 仍看得见；B 看得见自己
    await seat(h, "c", "p-c", personaAt(1000, 1300), "dusk");
    step(h);
    assert.ok(baselineItems(drain(h, "c")).some((item) => item.id === idB), "C 的 baseline 含 90 单位外的 B");
    drain(h, "a");
    drain(h, "b");
    h.mode.__probe.setVisibility(idB, { stealth: true });
    step(h);
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldLeave), [idB], "异阵营收 leave");
    assert.deepEqual(idsOf(drain(h, "c"), S2C.MmoWorldLeave), [], "同阵营不受影响");
    assert.deepEqual(idsOf(drain(h, "b"), S2C.MmoWorldLeave), [], "本人永远看得见自己");
    h.mode.__probe.setVisibility(idB, { stealth: false });
    step(h);
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldEnter), [idB], "解除隐身 ⇒ enter 恰一次");

    // 位面：B 去 plane 1 ⇒ A / C 收 leave；B 看不见位面 0 的 A / C，但仍有自己
    h.mode.__probe.setVisibility(idB, { plane: 1 });
    step(h);
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldLeave), [idB]);
    assert.deepEqual(idsOf(drain(h, "c"), S2C.MmoWorldLeave), [idB]);
    const leftForB = idsOf(drain(h, "b"), S2C.MmoWorldLeave);
    assert.ok(leftForB.includes(idA) && leftForB.includes(idC) && !leftForB.includes(idB), `B 在位面 1：${leftForB.join(",")}`);
    h.mode.__probe.setVisibility(idB, { plane: 0 });
    step(h);
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldEnter), [idB], "回位面 0 ⇒ enter");
    assert.throws(() => h.mode.__probe.setVisibility("nobody", { plane: 1 }), /不存在/u);
});

test("兴趣集上限：300 只 slime 挤在出生点 ⇒ 兴趣集最近优先截到 MMO_INTEREST_MAX_ENTITIES（含本人），框架 InterestSet 不抛", async () => {
    const crowded = clone(GREYBOX_PACK) as unknown as MutablePack;
    crowded.spawns = Array.from({ length: 6 }, (_unused, index) => ({ spawnId: `camp-${index}`, mapId: "greybox", templateId: "slime", pos: { x: 1000 + index * 10, y: 1000 }, count: 50, waypoints: [], managed: "kit" as const }));
    const h = harness(indexContentPack(validateContentPack(crowded)));
    await activeWorld(h);
    assert.equal([...h.mode.__probe.entities().values()].filter((entity) => entity.kind === "creature").length, 300);
    await seat(h, "a", "p-a");
    step(h);
    const items = baselineItems(drain(h, "a"));
    assert.equal(items.length, MMO_INTEREST_MAX_ENTITIES, "截到上限");
    assert.ok(items.some((item) => item.id === "char:c-p-a"), "本人必在");
    const mover = h.mode.__probe.moverOf("a")!;
    const distance = (point: { readonly x: number; readonly y: number }): number => Math.hypot(point.x - mover.x, point.y - mover.y);
    const farthestPicked = Math.max(...items.map(distance));
    const picked = new Set(items.map((item) => item.id));
    const skipped = [...h.mode.__probe.entities().values()].filter((entity) => !picked.has(entity.id));
    assert.equal(skipped.length, 301 - MMO_INTEREST_MAX_ENTITIES);
    assert.ok(skipped.every((entity) => distance(entity) >= farthestPicked), "最近优先：没选上的都不比选上的近");
    // 走两步：兴趣集仍收敛（差分只有位置变化的本人 + 可能的边缘换人），不抛
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } });
    step(h, 2);
    assert.ok(drain(h, "a").some((message) => message.type === S2C.MmoWorldUpdate));
});
