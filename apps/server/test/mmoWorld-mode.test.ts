/**
 * mmoWorld 服务端 WorldMode（MK0-B3，无头：WorldRuntime 直驱，⛔ Colyseus / DB）：
 *  - onWorldInit 按内容包为本图撒怪（灰盒 v5：三只 slime + 野猪 + 田鼠，确定性抖动在 spawn 附近）；图不在包内 ⇒ recover 拒；
 *  - onBeforeAdmit 预热角色行 → onAdmit：有角色放行、无角色拒；onEnter 落出生点或 persona 检查点位置（同图才回灌）；
 *  - move dir ⇒ 常量速度积分（120 × 0.05 = 6 / 步）并钳图；target ⇒ 直奔并到达停下；停下不再前进；
 *  - 视野流：首个 baseline = 本人 + 三只 slime；update 只在位置变时；本人私有流 hp / mp 一次；pickup / transfer ⇒ opResult rejected；
 *  - onCheckpoint：persona 快照 {mapId, x, y, hp, mp}、分线快照 creatures；onRestore 回灌怪物位置；
 *  - MK1-B1 movement 面：速度 / HP / MP 取内容包职业模板（caster 110 / 80 / 100）；本人每步收直发 `s2c.mmoWorld.pos`（seq = 最新意图；停下那步回执一次，之后不动不回）；
 *    撞灰盒墙停下并清目标；职业不在内容包 ⇒ 准入拒；
 *  - MK1-B2 AOI 接入：候选来自 kit 网格、精确视距 + 规则（位面 / 隐身 × 阵营）、最近优先截到 MMO_INTEREST_MAX_ENTITIES；超视野零泄露（远处角色的 id 不出现在任何出站）、
 *    走进视距 enter 恰一次、隐身只对同阵营可见、位面隔离、300 只挤在出生点也不触发框架 InterestSet 上限；
 *  - MK1-B3 两图交接：portal 不存在 / 不在半径 / 在途 ⇒ rejected；门内 ⇒ 框架交接端口（目标图 + kit 载荷）且落点先进 persona 快照；端口失败 ⇒ rejected + 落点清；
 *    Committed ⇒ perSession transferReady；目标图（东郊 2 只 slime）按 arrival 落位、HP / MP 随身，异图 / 未知落点 ⇒ 首个出生点；
 *  - MK1-B4 检查点定稿（schema v2）：onPersonaCheckpoint 只给该会话的 persona 快照；冷却按 tick 差折算剩余 ms 并在进图时按 fixedStep 回灌；分线快照 v2 槽位
 *    （loot / scriptVars / timers / regions）往返、timers 按 tick 差重排、regions 覆盖内容包缺省；v1 快照（无新字段）照常回灌；
 *  - MK1-B6 生产节拍（MMO_WORLD_TUNING）：角色位置每 2 步进观察者流、停下那步补 bump（终点必到）、本人 pos 回执仍每步；兴趣集每 4 步重算（enter 最多晚 3 步）、离座清缓存；
 *  - MK2-B1 combat：瞬发 strike 扣怪血 + 记仇恨 + 冷却进 private（集合变化才发）；拒绝原因经 opResult（cast:<seq>）；读条 fireball 到点结算 / 移动打断；治疗 / buff aura 到期消失；
 *    怪死 ⇒ 离开视野、按 respawnSec 复活回出生位；角色死 ⇒ 不能动不能施、5 s 后回复活点满血；同一命令序 + 同一种子 ⇒ 同一 hp 轨迹（无头重放）；
 *  - MK2-B2 ai：野猪 aggro 150 内主动追击、射程内 strike、玩家跑出拴绳 400 ⇒ evade（清仇恨回满血回家）；slime leash 0 只在射程内还手不追；田鼠三点巡逻；分桶每 4 步思考一次、
 *    假时钟下超预算顺延且下一 tick 优先；绕墙追击不进阻挡格；找路回执按 instanceEpoch / entityVersion 迟到即丢；
 *  - MK2-B3 掉落：怪死按 lootTable 掷骰（同种子同掉落）落地为 kind loot 实体（带 count）进视野；拾取：远 ⇒ range、拾到 ⇒ ok + 离开视野 + lootClaimed 进事件批、
 *    再拾 ⇒ 不存在；快照往返（expiresTick 重排、lootSeq 续用）；到期消失；无 eventTable ⇒ 拒；
 *  - MK3-B1 归属 / 背包：击杀者（仇恨最高的角色）15 s 内独占拾取（他人 ⇒ owned）、超时放开、快照带 owner 重排；进图私有流带预热的 bag、装备属性进基础攻防；
 *    拾取后按节拍轮询 loadBag，变了才再发一次 bag（然后停），没变则轮询到期停；离座清。
 * 变异验证（改哪一行 → 哪条用例转红）：mode 撒怪 count 循环改为 1 → 「三只 slime」红；onEnter 不看 restored.mapId → 「异图检查点不回灌」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S, S2C, WorldPhase, type IMmoEntityWire, type IMmoWorldBaselineChunk, type IMmoWorldEnter, type IMmoWorldLeave, type IMmoWorldOpResult, type IMmoWorldPos, type IMmoWorldPrivate,
    type IMmoWorldTransferReady, type IMmoWorldUpdate,
} from "@game/shared";
import { GREYBOX_BOAR_ID, GREYBOX_ITEMS, GREYBOX_RAT_ID, GREYBOX_SPELLS } from "@game/shared/kits/mmo/content/greybox";
import { indexContentPack, validateContentPack, type IContentPack, type IContentPackIndex } from "@game/shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import type { MmoClassId, MmoFactionId } from "@game/shared/kits/mmo/api/characters/index";
import type { MmoCharacterRow } from "../src/kits/mmo/api/characters/index";
import { buildCheckpointEnvelope } from "../src/rooms/core/CheckpointPort";
import { WorldRuntime, type WorldCheckpointBatch } from "../src/rooms/core/WorldRuntime";
import { MMO_INTEREST_MAX_ENTITIES, createMmoWorldMode, type MmoWorldMode, type MmoWorldModeOptions } from "../src/rooms/modes/mmoWorld/index";
import { parseCollisionGrid } from "@game/shared/kits/mmo/api/movement/index";
import type { PathResult, PathfinderPort } from "../src/kits/mmo/api/ai/index";
import { createRoomStateForMode, type MmoWorldRoomState } from "../src/rooms/schema/GameRoomState";
import type { WorldTransferReady, WorldTransferTarget } from "../src/rooms/WorldMode";
import { MMO_WORLD_CHECKPOINT_SCHEMA, MMO_WORLD_EVENT_TABLE, type MmoInstanceSnapshot, type MmoPersonaSnapshot } from "../src/kits/mmo/persistence/checkpoint";
import { MemoryCheckpointPort } from "../src/rooms/core/CheckpointPort";
import { MMO_EVENT_LOOT_CLAIMED, MMO_LOOT_EXPIRE_MS, type IMmoBagWire } from "@game/shared/kits/mmo/api/inventory/index";

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

type TransferPort = (session: string, target: WorldTransferTarget) => Promise<WorldTransferReady>;

function harness(content: IContentPackIndex = CONTENT, transfer: TransferPort | null = null, tuning: Partial<MmoWorldModeOptions> = {}): Harness {
    const characters = new Map<string, MmoCharacterRow>();
    const mode = createMmoWorldMode({ content, loadCharacter: async (_sId, personaId) => characters.get(personaId) ?? null, checkpoint: null, loadBag: null, ...tuning });
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
            ...(transfer ? { requestTransfer: transfer } : {}),
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

test("撒怪：本图五只怪（三只 slime + 野猪 + 田鼠）落在 spawn 附近（确定性）；图不在包内 ⇒ recover 拒；无角色的 persona 准入拒", async () => {
    const h = harness();
    await activeWorld(h);
    const creatures = [...h.mode.__probe.entities().values()].filter((entity) => entity.kind === "creature");
    assert.equal(creatures.length, 5, "三只 slime + 野猪 + 田鼠（灰盒 v5）");
    for (const creature of creatures) {
        const spawn = GREYBOX_PACK.spawns.find((candidate) => creature.id.startsWith(`${candidate.spawnId}:`))!;
        const template = GREYBOX_PACK.creatures.find((candidate) => candidate.templateId === creature.templateId)!;
        assert.ok(Math.abs(creature.x - spawn.pos.x) <= 40 && Math.abs(creature.y - spawn.pos.y) <= 40, `${creature.id} 在 spawn 抖动半径内 (${creature.x}, ${creature.y})`);
        assert.deepEqual([creature.templateId, creature.hp, creature.hpMax], [spawn.templateId, template.hpMax, template.hpMax]);
    }
    assert.deepEqual(creatures.map((creature) => creature.templateId).sort(), ["boar", "rat", "slime", "slime", "slime"]);
    assert.deepEqual([h.state.packId, h.state.packVersion, h.state.population], ["greybox", 6, 0]);
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
    assert.deepEqual([instance.mapId, instance.packId, instance.creatures.length], ["greybox", "greybox", 5]);

    // 恢复：怪物按快照位置回灌（挪一只到 (1300, 900)）
    const moved = { ...instance, creatures: instance.creatures.map((creature, index) => (index === 0 ? { ...creature, x: 1300, y: 900, hp: 5 } : creature)) };
    const recovered = harness();
    await activeWorld(recovered, "greybox", moved);
    const restored = recovered.mode.__probe.entities().get(instance.creatures[0]!.id)!;
    assert.deepEqual([restored.x, restored.y, restored.hp], [1300, 900, 5]);
    assert.ok(recovered.mode.__probe.log.includes("restore:5"));

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

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("两图交接：portal 不存在 / 不在范围 / 在途 ⇒ rejected；门内 ⇒ 框架端口（目标图 + kit 载荷）且落点先进 persona 快照；端口失败 ⇒ rejected + 落点清；Committed ⇒ perSession transferReady", async () => {
    const calls: { session: string; target: WorldTransferTarget }[] = [];
    let settle: { resolve: (ready: WorldTransferReady) => void; reject: (error: Error) => void } | null = null;
    const h = harness(CONTENT, (session, target) => new Promise((resolve, reject) => { calls.push({ session, target }); settle = { resolve, reject }; }));
    await activeWorld(h);
    await seat(h, "a", "p-a", personaAt(1000, 720)); // gate-east 在 (1000, 700) 半径 60
    step(h);
    drain(h, "a");
    const results = (): IMmoWorldOpResult[] => h.direct.filter((m) => m.session === "a" && m.type === S2C.MmoWorldOpResult).map((m) => m.payload as IMmoWorldOpResult);
    h.runtime.enqueue("a", C2S.MmoWorldTransfer, { portalId: "gate-nowhere", clientReqId: "t0" });
    step(h);
    assert.deepEqual(results().map((r) => [r.clientReqId, r.result, r.detail]), [["t0", "rejected", "portal 不存在"]]);
    // 走远：(1000, 720) → 向下 20 步 × 6 = (1000, 840)，距门 140
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, dir: { x: 0, y: 1 } });
    step(h, 20);
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
    h.runtime.enqueue("a", C2S.MmoWorldTransfer, { portalId: "gate-east", clientReqId: "t1" });
    step(h);
    assert.deepEqual([results().at(-1)!.clientReqId, results().at(-1)!.detail], ["t1", "不在传送门范围内"]);
    assert.equal(calls.length, 0, "⛔ 没到门不找框架");
    // 回到门内并发起
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 3, target: { x: 1000, y: 730 } });
    step(h, 25);
    assert.ok(Math.abs(h.mode.__probe.moverOf("a")!.y - 730) < 1e-6, "点地到门内");
    h.runtime.enqueue("a", C2S.MmoWorldTransfer, { portalId: "gate-east", clientReqId: "t2" });
    step(h);
    assert.deepEqual(calls.map((c) => [c.session, c.target.toMap, c.target.payload]), [["a", "greybox-east", { portalId: "gate-east", toSpawnPointId: "gate" }]], "框架交接端口：目标图 + kit 载荷");
    assert.deepEqual(h.mode.__probe.transfersInFlight(), ["a"]);
    h.runtime.enqueue("a", C2S.MmoWorldTransfer, { portalId: "gate-east", clientReqId: "t3" });
    step(h);
    assert.deepEqual([results().at(-1)!.clientReqId, results().at(-1)!.detail, calls.length], ["t3", "交接在途", 1]);
    const during = h.runtime.takeCheckpoint(true)!;
    assert.deepEqual((during.persona[0]!.snapshot as MmoPersonaSnapshot).arrival, { mapId: "greybox-east", spawnPointId: "gate" }, "在途期间的强制点带落点");
    // 端口失败 ⇒ rejected + 落点清 + 可重试
    settle!.reject(new Error("目标不可解析"));
    await flush();
    assert.deepEqual([results().at(-1)!.clientReqId, results().at(-1)!.detail], ["t2", "交接失败：目标不可解析"]);
    assert.deepEqual(h.mode.__probe.transfersInFlight(), []);
    assert.equal((h.runtime.takeCheckpoint(true)!.persona[0]!.snapshot as MmoPersonaSnapshot).arrival, undefined, "落点清");
    // 重试成功：Committed ⇒ transferReady perSession（凭据只此一处出网）
    h.runtime.enqueue("a", C2S.MmoWorldTransfer, { portalId: "gate-east", clientReqId: "t4" });
    step(h);
    assert.equal(calls.length, 2);
    settle!.resolve({ transferId: "wt_1", worldAddress: "s0/greybox-east/0", toMap: "greybox-east", toLine: 0, toInstance: "i-east", ticket: "T".repeat(24), expiresAt: 999 });
    await flush();
    step(h);
    const ready = drain(h, "a").filter((m) => m.type === S2C.MmoWorldTransferReady).map((m) => m.payload as IMmoWorldTransferReady);
    assert.deepEqual(ready, [{ transferId: "wt_1", worldAddress: "s0/greybox-east/0", ticket: "T".repeat(24), expiresAt: 999 }]);
    assert.ok(h.mode.__probe.log.includes("transfer:a:ready:greybox-east"));
    assert.deepEqual(h.mode.__probe.transfersInFlight(), ["a"], "Committed 后由壳离座清在途");
    assert.equal(h.direct.filter((m) => m.type === S2C.MmoWorldTransferReady).length, 0, "transferReady ⛔ 直发（perSession 不可丢类）");
});

test("交接落点：目标图（东郊 2 只 slime）按 persona 快照 arrival 落在 \"gate\" 且 HP / MP 随身；arrival 是别的图 / 未知落点 ⇒ 首个出生点；同图检查点优先", async () => {
    const east = harness();
    await activeWorld(east, "greybox-east");
    assert.equal([...east.mode.__probe.entities().values()].filter((e) => e.kind === "creature").length, 2);
    const envelope = (snapshot: MmoPersonaSnapshot) => buildCheckpointEnvelope({ rev: 5, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 1, snapshot });
    await seat(east, "a", "p-a", envelope({ mapId: "greybox", x: 1000, y: 730, hp: 60, mp: 20, arrival: { mapId: "greybox-east", spawnPointId: "gate" } }));
    const a = east.mode.__probe.moverOf("a")!;
    assert.deepEqual([a.x, a.y, a.hp, a.mp, a.arrival], [500, 720, 60, 20, null], "东郊 gate 落点 + HP / MP 随身，落点不带进新实体");
    assert.ok(east.mode.__probe.log.includes("enter:a:arrival"));
    await seat(east, "b", "p-b", envelope({ mapId: "greybox", x: 1, y: 1, hp: 60, mp: 20, arrival: { mapId: "greybox", spawnPointId: "gate" } }));
    assert.deepEqual([east.mode.__probe.moverOf("b")!.x, east.mode.__probe.moverOf("b")!.y], [500, 500], "arrival 指向别的图 ⇒ 首个出生点");
    await seat(east, "c", "p-c", envelope({ mapId: "greybox", x: 1, y: 1, hp: 60, mp: 20, arrival: { mapId: "greybox-east", spawnPointId: "nowhere" } }));
    assert.deepEqual([east.mode.__probe.moverOf("c")!.x, east.mode.__probe.moverOf("c")!.y], [500, 500], "未知落点 ⇒ 首个出生点");
    await seat(east, "d", "p-d", envelope({ mapId: "greybox-east", x: 600, y: 600, hp: 60, mp: 20, arrival: { mapId: "greybox-east", spawnPointId: "gate" } }));
    assert.deepEqual([east.mode.__probe.moverOf("d")!.x, east.mode.__probe.moverOf("d")!.y], [600, 600], "同图检查点优先于落点");
});

test("检查点 v2：onPersonaCheckpoint 只给该会话；冷却剩余 ms 往返（tick 差 × fixedStep）；分线 v2 槽位往返、timers 重排、regions 覆盖；v1 快照照常回灌", async () => {
    const h = harness();
    await activeWorld(h);
    await seat(h, "a", "p-a");
    await seat(h, "b", "p-b", personaAt(1500, 300));
    step(h, 4); // tick 4
    h.mode.__probe.setCooldown("char:c-p-a", "strike", 14); // 就绪 tick 14 ⇒ 剩余 10 步 × 50 ms = 500 ms
    h.mode.__probe.setCooldown("char:c-p-a", "stale", 2); // 已过期 ⇒ 不进快照
    h.mode.__probe.setTimer("respawn:slime-camp:0", 104);
    h.mode.__probe.setRegion("gate-zone", true);
    h.mode.__probe.setVar("bossPhase", 2);
    const own = h.mode.onPersonaCheckpoint!(h.runtime.context(), "a") as MmoPersonaSnapshot;
    assert.deepEqual(own, { mapId: "greybox", x: 1000, y: 1000, hp: 100, mp: 50, cooldowns: { strike: 500 } }, "只有本人快照 + 剩余冷却（过期的不进）");
    drain(h, "a");
    assert.equal(h.mode.onPersonaCheckpoint!(h.runtime.context(), "nobody"), null);
    const checkpoint = h.runtime.takeCheckpoint(true)!;
    assert.deepEqual(checkpoint.persona.map((entry) => entry.personaId).sort(), ["p-a", "p-b"], "全批含两人");
    const instance = checkpoint.instance as MmoInstanceSnapshot;
    assert.deepEqual([instance.tick, instance.timers, instance.regions, instance.scriptVars, instance.loot, instance.creatures[0]!.alive], [4, [{ id: "respawn:slime-camp:0", dueTick: 104 }], { "gate-zone": true }, { bossPhase: 2 }, [], true]);
    // 恢复：新分线 tick 从 0 起 ⇒ timer 重排到 100；regions / vars / loot 回灌；冷却回灌 = 当前 tick + ceil(500 / 50)
    const recovered = harness();
    await activeWorld(recovered, "greybox", instance);
    assert.deepEqual([[...recovered.mode.__probe.timers()], [...recovered.mode.__probe.regions()], recovered.mode.__probe.vars()], [[["respawn:slime-camp:0", 100]], [["gate-zone", true]], { bossPhase: 2 }]);
    step(recovered, 3); // tick 3
    await seat(recovered, "a", "p-a", buildCheckpointEnvelope({ rev: 9, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 2, snapshot: own }));
    assert.deepEqual([...recovered.mode.__probe.moverOf("a")!.cooldowns], [["strike", 13]], "剩余 500 ms ⇒ 就绪 tick = 3 + 10");
    // v1 快照（无 v2 字段）照常回灌：creatures 落位、槽位保持缺省
    const legacy = harness();
    const v1 = { tick: 7, mapId: "greybox", packId: "greybox", packVersion: 3, creatures: instance.creatures.map((c) => ({ id: c.id, templateId: c.templateId, x: 1300, y: 900, hp: 5 })) };
    await activeWorld(legacy, "greybox", v1 as unknown as MmoInstanceSnapshot);
    assert.deepEqual([legacy.mode.__probe.entities().get(instance.creatures[0]!.id)!.x, legacy.mode.__probe.timers().size, legacy.mode.__probe.regions().size, legacy.mode.__probe.vars()], [1300, 0, 0, {}]);
    await seat(legacy, "a", "p-a", buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 1, snapshot: { mapId: "greybox", x: 1100, y: 1000, hp: 40, mp: 10 } satisfies MmoPersonaSnapshot }));
    assert.deepEqual([legacy.mode.__probe.moverOf("a")!.x, legacy.mode.__probe.moverOf("a")!.cooldowns.size], [1100, 0]);
});

test("生产节拍（MMO_WORLD_TUNING 2 / 4）：位置每 2 步进流一次（相位按实体错开）、停下后流里的终点 = 权威位置、pos 回执仍每步；兴趣集每 4 步重算（走进视距 enter 最多晚 3 步、恰一次）、零泄露不变", async () => {
    const h = harness(CONTENT, null, { characterUpdateEveryTicks: 2, interestEveryTicks: 4 });
    await activeWorld(h);
    await seat(h, "a", "p-a");
    await seat(h, "b", "p-b", personaAt(1000, 1900), "dusk");
    step(h);
    drain(h, "a");
    drain(h, "b");
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } });
    step(h, 4); // tick 2..5（各 6 单位 ⇒ 1024）：任意 4 个连续 tick 里恰 2 个是本实体的节拍 tick ⇒ rev 2
    const moving = drain(h, "a").filter((m) => m.type === S2C.MmoWorldUpdate).map((m) => m.payload as IMmoWorldUpdate);
    assert.deepEqual(moving.map((u) => u.rev), [2], "四步只进流两次（合并后一条，rev 2）");
    assert.ok(moving[0]!.x === 1018 || moving[0]!.x === 1024, `流里是节拍 tick 的位置（1018 或 1024，视相位）：${moving[0]!.x}`);
    assert.equal(h.direct.filter((m) => m.session === "a" && m.type === S2C.MmoWorldPos).length, 4, "本人 pos 回执仍每步");
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
    step(h, 2);
    const mover = h.mode.__probe.moverOf("a")!;
    const stopped = drain(h, "a").filter((m) => m.type === S2C.MmoWorldUpdate).map((m) => m.payload as IMmoWorldUpdate);
    const lastX = stopped.length > 0 ? stopped.at(-1)!.x : moving.at(-1)!.x;
    assert.equal(lastX, mover.x, "停下后流里的终点 = 权威位置（相位落在奇数 tick 时由停下那步补 bump）");
    assert.equal(mover.x, 1024);
    // 兴趣集节拍：B 从 900 单位外向南走进视距（第 84 步进 400），enter 最多晚 3 步
    h.runtime.enqueue("b", C2S.MmoWorldMove, { seq: 1, dir: { x: 0, y: -1 } });
    step(h, 83);
    assert.equal(mentions(drain(h, "a"), "char:c-p-b"), 0, "零泄露：进视距前 A 的出站不含 B");
    step(h, 4);
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldEnter), ["char:c-p-b"], "enter 恰一次（≤ 4 步内）");
    step(h, 8);
    assert.equal(idsOf(drain(h, "a"), S2C.MmoWorldEnter).length, 0, "⛔ 重复 enter");
});

const resultsOf = (h: Harness, session: string): IMmoWorldOpResult[] => h.direct.filter((m) => m.session === session && m.type === S2C.MmoWorldOpResult).map((m) => m.payload as IMmoWorldOpResult);
const privatesOf = (messages: readonly { type: string; payload: unknown }[]): IMmoWorldPrivate[] => messages.filter((m) => m.type === S2C.MmoWorldPrivate).map((m) => m.payload as IMmoWorldPrivate);
const nearestSlime = (h: Harness): { id: string; x: number; y: number } => [...h.mode.__probe.entities().values()].filter((e) => e.kind === "creature" && e.templateId === "slime").sort((a, b) => a.id < b.id ? -1 : 1)[0]!;
/** MK2-B1 战斗用例的内容：slime 不带技能（木桩），把玩家侧施法管线与 MK2-B2 的怪物还手分开验（还手见 ai 用例）。 */
const DUMMY_CONTENT: IContentPackIndex = (() => {
    const pack = clone(GREYBOX_PACK) as unknown as MutablePack;
    pack.creatures = pack.creatures.map((creature) => (creature.templateId === "slime" ? { ...creature, spells: [] } : creature));
    return indexContentPack(validateContentPack(pack));
})();

test("combat（MK2-B1）：瞬发 strike 扣怪血 / 记仇恨 / 冷却进 private（集合变化才发）；拒绝：未知技能 / 未学 / 冷却 / 射程 / 无目标；读条 fireball 移动打断与到点结算 + 扣蓝；治疗 / buff aura 到期", async () => {
    const h = harness(DUMMY_CONTENT);
    await activeWorld(h);
    const slime = nearestSlime(h);
    await seat(h, "a", "p-a", personaAt(slime.x - 30, slime.y)); // 战士，距怪 30（strike 射程 60）
    step(h);
    drain(h, "a");
    const hpBefore = h.mode.__probe.entities().get(slime.id)!.hp;
    h.runtime.enqueue("a", C2S.MmoWorldTarget, { entityId: slime.id });
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 1, spellId: GREYBOX_SPELLS.strike });
    step(h);
    const after = h.mode.__probe.entities().get(slime.id)!;
    assert.ok(after.hp < hpBefore && after.hp >= hpBefore - 15, `怪血下降 ${hpBefore} → ${after.hp}（12–14）`);
    assert.equal(after.threat.get("char:c-p-a"), hpBefore - after.hp, "仇恨 = 伤害");
    assert.deepEqual(resultsOf(h, "a").map((r) => [r.clientReqId, r.result]), [["cast:1", "ok"]]);
    const out = drain(h, "a");
    assert.ok(out.some((m) => m.type === S2C.MmoWorldUpdate && (m.payload as IMmoWorldUpdate).id === slime.id && (m.payload as IMmoWorldUpdate).hp === after.hp), "视野流 update 带新 hp");
    const priv = privatesOf(out);
    assert.deepEqual(priv.at(-1)?.cooldowns, { strike: 1500 }, "冷却进 private（剩余 ms）");
    step(h, 3);
    assert.equal(privatesOf(drain(h, "a")).length, 0, "倒计时 ⛔ 每 tick 发（集合未变）");
    // 拒绝
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 2, spellId: GREYBOX_SPELLS.strike });
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 3, spellId: "nova" });
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 4, spellId: GREYBOX_SPELLS.fireball });
    step(h);
    assert.deepEqual(resultsOf(h, "a").slice(1).map((r) => [r.clientReqId, r.detail]), [["cast:2", "cooldown"], ["cast:3", "unknown-spell"], ["cast:4", "not-learned"]]);
    step(h, 30); // 冷却过期 ⇒ private 集合变化发一次
    assert.deepEqual(privatesOf(drain(h, "a")).map((p) => p.cooldowns), [undefined], "冷却到点 ⇒ 集合变空发一次");
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, target: { x: slime.x - 200, y: slime.y } });
    step(h, 30);
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 5, spellId: GREYBOX_SPELLS.strike });
    h.runtime.enqueue("a", C2S.MmoWorldTarget, { entityId: null });
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 6, spellId: GREYBOX_SPELLS.strike });
    step(h);
    assert.deepEqual(resultsOf(h, "a").slice(4).map((r) => [r.clientReqId, r.detail]), [["cast:5", "range"], ["cast:6", "no-target"]]);
    // 读条：法师 fireball（1000 ms = 20 步），移动打断；再施到点结算 + 扣蓝 10
    h.characters.set("p-c", rowOf("p-c", "Mage", "caster"));
    const reqC = request("c", "p-c", personaAt(slime.x - 100, slime.y));
    await h.runtime.beforeAdmit(reqC);
    assert.equal(h.runtime.admit(reqC), "admitted");
    step(h);
    drain(h, "c");
    const hpMid = h.mode.__probe.entities().get(slime.id)!.hp;
    h.runtime.enqueue("c", C2S.MmoWorldCast, { seq: 1, spellId: GREYBOX_SPELLS.fireball, targetId: slime.id });
    step(h);
    assert.equal(privatesOf(drain(h, "c")).at(-1)?.casting?.spellId, GREYBOX_SPELLS.fireball, "读条进 private");
    step(h, 5);
    h.runtime.enqueue("c", C2S.MmoWorldMove, { seq: 1, dir: { x: -1, y: 0 } });
    step(h);
    assert.deepEqual(resultsOf(h, "c").map((r) => [r.clientReqId, r.detail]), [["cast:1", "moved"]], "移动打断读条");
    assert.equal(h.mode.__probe.entities().get(slime.id)!.hp, hpMid, "打断 ⇒ 无伤害");
    h.runtime.enqueue("c", C2S.MmoWorldMove, { seq: 2, dir: { x: 0, y: 0 } });
    h.runtime.enqueue("c", C2S.MmoWorldCast, { seq: 2, spellId: GREYBOX_SPELLS.fireball, targetId: slime.id });
    step(h, 19);
    assert.equal(h.mode.__probe.entities().get(slime.id)!.hp, hpMid, "到点前不结算");
    step(h, 2);
    const mage = h.mode.__probe.moverOf("c")!;
    assert.ok(h.mode.__probe.entities().get(slime.id)!.hp < hpMid, "到点结算");
    assert.deepEqual([mage.mp, resultsOf(h, "c").at(-1)?.result], [40, "ok"], "扣蓝 10（personaAt 进图 mp 50）+ ok 回执");
    // 治疗 + buff：法师受伤后 mend 自己；战士 guard ⇒ aura 到期消失
    h.mode.__probe.damage(mage.id, 40);
    step(h, 130); // 等 fireball 冷却（4 s = 80 步）与读条余量
    h.runtime.enqueue("c", C2S.MmoWorldCast, { seq: 3, spellId: GREYBOX_SPELLS.mend });
    step(h, 31);
    assert.ok(mage.hp > 40 && mage.hp <= 80, `治疗后 ${mage.hp}`);
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 7, spellId: GREYBOX_SPELLS.guard });
    step(h);
    const fighter = h.mode.__probe.moverOf("a")!;
    assert.deepEqual([...fighter.auras.keys()], [GREYBOX_SPELLS.guard], "buff aura 挂上");
    step(h, 161); // 8 s = 160 步后过期
    assert.equal(fighter.auras.size, 0, "aura 到期消失");
});

test("combat（MK2-B1）：怪死 ⇒ 离开视野 + 按 respawnSec 复活回出生位；角色死 ⇒ 不能动 / 不能施，5 s 后回复活点满血；同一命令序 + 同一种子 ⇒ 同一 hp 轨迹（无头重放）", async () => {
    const h = harness(DUMMY_CONTENT);
    await activeWorld(h);
    const slime = nearestSlime(h);
    await seat(h, "a", "p-a", personaAt(slime.x - 30, slime.y));
    step(h);
    drain(h, "a");
    h.mode.__probe.damage(slime.id, 29); // 剩 1 血
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 1, spellId: GREYBOX_SPELLS.strike, targetId: slime.id });
    step(h);
    const dead = h.mode.__probe.entities().get(slime.id)!;
    assert.deepEqual([dead.alive, dead.hp, dead.threat.size], [false, 0, 0], "死亡：热状态清");
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldLeave), [slime.id], "怪离开视野");
    assert.ok(h.mode.__probe.log.includes(`death:${slime.id}`));
    step(h, 401); // respawnSec 20 = 400 步
    const back = h.mode.__probe.entities().get(slime.id)!;
    assert.deepEqual([back.alive, back.hp, back.x, back.y], [true, 30, slime.x, slime.y], "复活回出生位满血");
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldEnter), [slime.id], "复活 ⇒ enter");
    // 角色死亡
    const fighter = h.mode.__probe.moverOf("a")!;
    h.mode.__probe.damage(fighter.id, 100);
    step(h);
    assert.deepEqual([fighter.alive, fighter.hp], [false, 0]);
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, dir: { x: 1, y: 0 } });
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 2, spellId: GREYBOX_SPELLS.strike, targetId: slime.id });
    step(h, 2);
    assert.deepEqual([fighter.x, resultsOf(h, "a").at(-1)?.detail], [slime.x - 30, "dead"], "死者不动、不能施");
    step(h, 100); // 5 s
    assert.deepEqual([fighter.alive, fighter.hp, fighter.x, fighter.y], [true, 100, 1000, 1000], "回复活点满血");
    // 无头重放：同种子同命令序 ⇒ 同轨迹
    const trajectory = async (): Promise<number[]> => {
        const r = harness(DUMMY_CONTENT);
        await activeWorld(r);
        const target = nearestSlime(r);
        await seat(r, "a", "p-a", personaAt(target.x - 30, target.y));
        const hps: number[] = [];
        for (let round = 1; round <= 3; round += 1) {
            r.runtime.enqueue("a", C2S.MmoWorldCast, { seq: round, spellId: GREYBOX_SPELLS.strike, targetId: target.id });
            step(r, 31);
            hps.push(r.mode.__probe.entities().get(target.id)!.hp);
        }
        return hps;
    };
    const first = await trajectory();
    assert.deepEqual(await trajectory(), first, `重放一致：${first.join(",")}`);
    assert.ok(first[0]! > first[1]! && first[1]! >= first[2]!, "每轮都在掉血");
});

const creatureOf = (h: Harness, templateId: string) => [...h.mode.__probe.entities().values()].find((e) => e.kind === "creature" && e.templateId === templateId)!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

test("ai（MK2-B2）：野猪 aggro 内主动追击 → 射程内 strike 扣血；玩家跑出拴绳 ⇒ evade（清仇恨、回满血、回家转 idle）；slime leash 0 只在射程内还手不追", async () => {
    const h = harness();
    await activeWorld(h);
    const boar = creatureOf(h, GREYBOX_BOAR_ID);
    await seat(h, "a", "p-a", personaAt(boar.origin.x, boar.origin.y - 100)); // aggro 150 内
    step(h);
    drain(h, "a");
    const fighter = h.mode.__probe.moverOf("a")!;
    step(h, 6);
    assert.deepEqual([h.mode.__probe.brainOf(boar.id)?.state, h.mode.__probe.brainOf(boar.id)?.targetId], ["chase", fighter.id], "分桶思考后进入追击");
    const before = dist(boar, fighter);
    step(h, 10);
    assert.ok(dist(boar, fighter) < before, "在靠近");
    step(h, 40);
    assert.ok(dist(boar, fighter) <= 60 + 8, `追到射程附近 ${dist(boar, fighter).toFixed(1)}`);
    assert.ok(fighter.hp < 100, `射程内 strike 扣血：${fighter.hp}`);
    assert.ok(h.mode.__probe.log.some((line) => line.startsWith(`hit:${boar.id}>`)), "怪物走同一施法管线");
    // 玩家向北跑出拴绳（野猪 90/s 追不上 120/s）
    h.runtime.enqueue("a", C2S.MmoWorldMove, { seq: 1, target: { x: fighter.x, y: boar.origin.y - 700 } });
    step(h, 200);
    assert.deepEqual([boar.threat.size, boar.targetId, boar.hp], [0, null, boar.hpMax], "evade：清仇恨 / 清目标 / 回满血");
    step(h, 200);
    assert.ok(dist(boar, boar.origin) <= 8, `回到出生位 ${dist(boar, boar.origin).toFixed(1)}`);
    assert.equal(h.mode.__probe.brainOf(boar.id)?.state, "idle");
    // slime：leash 0 ⇒ 被打只还手不追
    const slime = nearestSlime(h);
    const slimeHome = { x: slime.x, y: slime.y };
    await seat(h, "b", "p-b", personaAt(slime.x - 30, slime.y));
    step(h);
    const b = h.mode.__probe.moverOf("b")!;
    h.runtime.enqueue("b", C2S.MmoWorldCast, { seq: 1, spellId: GREYBOX_SPELLS.strike, targetId: slime.id });
    step(h, 6);
    assert.ok(b.hp < 100, `slime 还手：${b.hp}`);
    const slimeEntity = h.mode.__probe.entities().get(slime.id)!;
    h.runtime.enqueue("b", C2S.MmoWorldMove, { seq: 1, target: { x: slime.x - 150, y: slime.y } });
    step(h, 40);
    const hpAfterRetreat = b.hp;
    step(h, 60);
    assert.deepEqual([slimeEntity.x, slimeEntity.y, b.hp], [slimeHome.x, slimeHome.y, hpAfterRetreat], "leash 0：不离开出生位，射程外不再挨打");
});

test("ai（MK2-B2）：田鼠三点巡逻；分桶每 4 步思考一次；假时钟超预算顺延且下一 tick 优先（不饿死）", async () => {
    const h = harness();
    await activeWorld(h);
    const rat = creatureOf(h, GREYBOX_RAT_ID);
    const visited = { b: false, c: false, home: false };
    for (let index = 0; index < 400; index += 1) {
        step(h);
        if (dist(rat, { x: 700, y: 500 }) <= 10) visited.b = true;
        if (visited.b && dist(rat, { x: 700, y: 700 }) <= 10) visited.c = true;
        if (visited.c && dist(rat, { x: 500, y: 500 }) <= 10) visited.home = true;
    }
    assert.deepEqual(visited, { b: true, c: true, home: true }, "三点巡逻转了一圈");
    const ticks: number[] = [];
    for (let index = 0; index < 12; index += 1) { step(h); const at = h.mode.__probe.brainOf(rat.id)!.thinkTick; if (ticks.at(-1) !== at) ticks.push(at); }
    assert.ok(ticks.length >= 3 && ticks.slice(1).every((at, i) => at - ticks[i]! === 4), `每 4 步思考一次：${ticks.join(",")}`);
    // 预算：300 只挤一桶 + 假时钟每读一次走 1.5 ms、预算 2 ms ⇒ 每 tick 只思考 2 只，其余顺延且轮转（160 步后人人都思考过 = 不饿死）
    const crowded = clone(GREYBOX_PACK) as unknown as MutablePack;
    crowded.spawns = Array.from({ length: 6 }, (_u, i) => ({ spawnId: `camp-${i}`, mapId: "greybox", templateId: "slime", pos: { x: 1000 + i * 10, y: 1000 }, count: 50, waypoints: [], managed: "kit" as const }));
    let clock = 0;
    const budgeted = harness(indexContentPack(validateContentPack(crowded)), null, { aiBuckets: 1, aiBudgetMs: 2, aiClock: () => { clock += 1.5; return clock; } });
    await activeWorld(budgeted);
    step(budgeted);
    const stats = { ...budgeted.mode.__probe.aiStats() };
    assert.deepEqual([stats.thought, stats.deferred], [2, 298], "预算 2 ms：每 tick 思考 2 只、298 只顺延（crowded 包只有 300 只 slime）");
    step(budgeted, 159);
    const brains = [...budgeted.mode.__probe.entities().values()].filter((e) => e.brain).map((e) => e.brain!.thinkTick);
    assert.deepEqual([brains.length, brains.every((at) => at >= 0), Math.max(...brains) - Math.min(...brains) <= 149], [300, true, true], "160 步后 300 只都思考过且轮转公平（最早与最晚相差 ≤ 149 步）");
});

test("ai（MK2-B2）：绕墙追击不进阻挡格；找路回执按 entityVersion / instanceEpoch 迟到即丢", async () => {
    // 野猪出生在墙西侧、aggro 500 拴绳 900；玩家在墙东侧 ⇒ A* 绕墙
    const pack = clone(GREYBOX_PACK) as unknown as MutablePack;
    pack.creatures = pack.creatures.map((c) => (c.templateId === GREYBOX_BOAR_ID ? { ...c, aggroRadius: 500, leashRadius: 900 } : c));
    pack.spawns = pack.spawns.map((s) => (s.spawnId === "boar-den" ? { ...s, pos: { x: 1400, y: 1000 } } : s));
    const content = indexContentPack(validateContentPack(pack));
    const grid = parseCollisionGrid(content.mapById.get("greybox")!.collision, content.mapById.get("greybox")!.size)!;
    const h = harness(content);
    await activeWorld(h);
    const boar = creatureOf(h, GREYBOX_BOAR_ID);
    await seat(h, "a", "p-a", personaAt(1800, 1000));
    step(h);
    const player = h.mode.__probe.moverOf("a")!;
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 400; index += 1) {
        step(h);
        assert.equal(grid.blocked(boar.x, boar.y), false, `第 ${index} 步野猪不在墙里 (${boar.x.toFixed(0)}, ${boar.y.toFixed(0)})`);
        closest = Math.min(closest, dist(boar, player));
    }
    assert.ok(closest <= 70, `绕墙后追到射程附近：${closest.toFixed(1)}`);
    // 迟到回执：可控找路端口
    const requests: { input: Parameters<PathfinderPort["request"]>[0]; resolve: (r: PathResult) => void }[] = [];
    const port: PathfinderPort = { request: (input) => new Promise((resolve) => { requests.push({ input, resolve }); }) };
    const l = harness(CONTENT, null, { pathfinder: port });
    await activeWorld(l);
    const boar2 = creatureOf(l, GREYBOX_BOAR_ID);
    await seat(l, "a", "p-a", personaAt(boar2.origin.x, boar2.origin.y - 100));
    step(l, 6);
    const boarRequests = requests.filter((request) => request.input.entityId === boar2.id);
    assert.equal(boarRequests.length, 1, "acquire 发一次找路（田鼠巡逻的请求另算）");
    const first = boarRequests[0]!;
    assert.deepEqual([l.mode.__probe.brainOf(boar2.id)?.pathPending, l.mode.__probe.brainOf(boar2.id)?.pathVersion], [true, 1]);
    first.resolve({ instanceEpoch: 99, entityId: boar2.id, entityVersion: 1, path: [{ x: 1, y: 1 }] });
    await new Promise((resolve) => setImmediate(resolve));
    step(l);
    assert.deepEqual([l.mode.__probe.brainOf(boar2.id)?.pathPending, l.mode.__probe.brainOf(boar2.id)?.path], [true, null], "权威换代的回执丢弃");
    l.mode.__probe.damage(boar2.id, 40); // 死亡 ⇒ pathVersion +1
    step(l);
    first.resolve({ instanceEpoch: 1, entityId: boar2.id, entityVersion: 1, path: [{ x: 2, y: 2 }] });
    await new Promise((resolve) => setImmediate(resolve));
    step(l);
    assert.deepEqual([l.mode.__probe.brainOf(boar2.id)?.pathVersion, l.mode.__probe.brainOf(boar2.id)?.path], [2, null], "版本变了的回执丢弃");
});

const lootHarness = (content: IContentPackIndex = DUMMY_CONTENT): Harness =>
    harness(content, null, { checkpoint: { kitId: "mmo", port: new MemoryCheckpointPort(), schema: MMO_WORLD_CHECKPOINT_SCHEMA, eventTable: MMO_WORLD_EVENT_TABLE } });

test("掉落（MK2-B3）：怪死掷骰落地为 loot 实体（count 进视野；同种子同掉落）；拾取：远 ⇒ range、近 ⇒ ok + 离开视野 + lootClaimed 进事件批（随检查点）、再拾 ⇒ 不存在；无 eventTable ⇒ 拒", async () => {
    const killAndDrop = async (h: Harness) => {
        await activeWorld(h);
        const slime = nearestSlime(h);
        await seat(h, "a", "p-a", personaAt(slime.x - 30, slime.y));
        step(h);
        drain(h, "a");
        h.mode.__probe.damage(slime.id, 30);
        step(h);
        const drops = [...h.mode.__probe.loot().values()];
        assert.equal(drops.length, 1, "一件掉落");
        return { slime, drop: drops[0]! };
    };
    const h = lootHarness();
    const { slime, drop } = await killAndDrop(h);
    assert.ok([GREYBOX_ITEMS.gel, GREYBOX_ITEMS.blade].includes(drop.itemId as "slime-gel"), `掉落来自 slime-drops：${drop.itemId}`);
    assert.deepEqual([drop.x, drop.y, drop.count >= 1], [slime.x, slime.y, true], "落在尸体位置");
    const out = drain(h, "a");
    assert.deepEqual(idsOf(out, S2C.MmoWorldLeave), [slime.id], "怪离开视野");
    const enter = out.find((m) => m.type === S2C.MmoWorldEnter && (m.payload as IMmoWorldEnter).entity.id === drop.id)?.payload as IMmoWorldEnter | undefined;
    assert.deepEqual([enter?.entity.kind, enter?.entity.templateId, enter?.entity.count, enter?.entity.hp], ["loot", drop.itemId, drop.count, 1], "loot 实体进视野带 count");
    const again = lootHarness();
    const replay = await killAndDrop(again);
    assert.deepEqual([replay.drop.itemId, replay.drop.count], [drop.itemId, drop.count], "同种子同命令序 ⇒ 同掉落");
    // 远处的 b 拾不到；a 拾到 ⇒ ok + 掉落离开视野 + 事件批
    await seat(h, "b", "p-b", personaAt(slime.x - 300, slime.y));
    step(h);
    drain(h, "b");
    h.runtime.enqueue("b", C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "pb1" });
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: "loot:404", clientReqId: "pa0" });
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "pa1" });
    step(h);
    assert.deepEqual(resultsOf(h, "b").map((r) => [r.clientReqId, r.result, r.detail]), [["pb1", "rejected", "range"]]);
    assert.deepEqual(resultsOf(h, "a").map((r) => [r.clientReqId, r.result, r.detail]), [["pa0", "rejected", "loot 不存在"], ["pa1", "ok", undefined]]);
    assert.equal(h.mode.__probe.loot().size, 0, "掉落已认领");
    assert.deepEqual(idsOf(drain(h, "a"), S2C.MmoWorldLeave), [drop.id], "掉落离开视野");
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "pa2" });
    step(h);
    assert.deepEqual(resultsOf(h, "a").at(-1)?.detail, "loot 不存在", "再拾 ⇒ 不存在");
    const batch = h.runtime.takeCheckpointBatch(true, "test")!;
    const fighter = h.mode.__probe.moverOf("a")!;
    assert.deepEqual(batch.events.map((event) => [event.kind, event.payload]), [[MMO_EVENT_LOOT_CLAIMED, { actorEntityId: fighter.id, actorCharacterId: fighter.characterId, lootId: drop.id, itemTemplateId: drop.itemId, count: drop.count }]], "lootClaimed 随检查点批出去");
    assert.ok(h.mode.__probe.log.includes(`pickup:a:${drop.id}`));
    // 无 durable 能力（checkpoint null）：拾取拒绝、掉落仍在
    const plain = harness(DUMMY_CONTENT);
    await activeWorld(plain);
    await seat(plain, "a", "p-a", personaAt(600, 600));
    step(plain);
    const id = plain.mode.__probe.spawnLoot(GREYBOX_ITEMS.hide, 2, 610, 600);
    plain.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: id, clientReqId: "p1" });
    step(plain);
    assert.deepEqual([resultsOf(plain, "a").at(-1)?.detail, plain.mode.__probe.loot().size], ["durable 不可用", 1]);
});

test("掉落（MK2-B3）：分线快照 loot / lootSeq 往返（expiresTick 按 tick 差重排、新掉落 id 续号）；到期消失（leave）；上限淘汰最早的一件", async () => {
    const h = lootHarness();
    await activeWorld(h);
    await seat(h, "a", "p-a", personaAt(600, 600));
    step(h, 3);
    const id = h.mode.__probe.spawnLoot(GREYBOX_ITEMS.hide, 3, 620, 600);
    step(h);
    assert.ok(idsOf(drain(h, "a"), S2C.MmoWorldEnter).includes(id), "掉落 enter");
    const snapshot = h.runtime.takeCheckpoint(true)!.instance as MmoInstanceSnapshot;
    const expiresTicks = ticksOfMs(MMO_LOOT_EXPIRE_MS);
    assert.deepEqual(snapshot.loot, [{ id, itemId: GREYBOX_ITEMS.hide, count: 3, x: 620, y: 600, expiresTick: 3 + expiresTicks }]);
    assert.equal(snapshot.lootSeq, 1);
    const restored = lootHarness();
    await activeWorld(restored, "greybox", snapshot);
    const back = restored.mode.__probe.loot().get(id)!;
    assert.deepEqual([back.itemId, back.count, back.x, back.expiresTick], [GREYBOX_ITEMS.hide, 3, 620, expiresTicks - 1], "新分线 tick 从 0 起 ⇒ 到期重排（快照 tick 4 − 3 = 1 步已过）");
    assert.equal(restored.mode.__probe.spawnLoot(GREYBOX_ITEMS.gel, 1, 500, 500), "loot:2", "lootSeq 续号");
    await seat(restored, "a", "p-a", personaAt(600, 600));
    step(restored);
    drain(restored, "a");
    step(restored, expiresTicks);
    assert.equal(restored.mode.__probe.loot().has(id), false, "到期消失");
    assert.ok(idsOf(drain(restored, "a"), S2C.MmoWorldLeave).includes(id), "到期 ⇒ leave");
    for (let index = 0; index < 512; index += 1) restored.mode.__probe.spawnLoot(GREYBOX_ITEMS.gel, 1, 100 + (index % 50), 100 + Math.floor(index / 50));
    assert.deepEqual([restored.mode.__probe.loot().size, restored.mode.__probe.loot().has("loot:2")], [512, false], "上限 512：最早的一件被淘汰");
});
const ticksOfMs = (ms: number): number => Math.ceil(ms / 50);

test("掉落归属（MK3-B1）：击杀者 15 s 内独占——他人拾 ⇒ owned、击杀者拾 ⇒ ok；超时后他人可拾；探针伤害无仇恨 ⇒ 无主；快照往返带 owner（按 tick 差重排）", async () => {
    const h = lootHarness();
    await activeWorld(h);
    const slime = nearestSlime(h);
    await seat(h, "a", "p-a", personaAt(slime.x - 30, slime.y));
    await seat(h, "b", "p-b", personaAt(slime.x + 30, slime.y));
    step(h);
    h.mode.__probe.damage(slime.id, 29); // 剩 1 血：a 的一次 strike 击杀 ⇒ 仇恨记在 a
    h.runtime.enqueue("a", C2S.MmoWorldCast, { seq: 1, spellId: GREYBOX_SPELLS.strike, targetId: slime.id });
    step(h);
    const drop = [...h.mode.__probe.loot().values()][0]!;
    const a = h.mode.__probe.moverOf("a")!;
    assert.deepEqual([drop.ownerCharacterId, drop.ownerUntilTick > h.state.tick], [a.characterId, true], "击杀者为主");
    h.runtime.enqueue("b", C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "pb1" });
    step(h);
    assert.deepEqual(resultsOf(h, "b").at(-1)?.detail, "owned", "他人独占期内拒");
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: drop.id, clientReqId: "pa1" });
    step(h);
    assert.deepEqual(resultsOf(h, "a").at(-1)?.result, "ok", "击杀者可拾");
    // 探针直接落一件有主的：超时（15 s = 300 步）后他人可拾
    const owned = h.mode.__probe.spawnLoot(GREYBOX_ITEMS.hide, 1, slime.x + 20, slime.y, a.characterId);
    h.runtime.enqueue("b", C2S.MmoWorldPickup, { lootId: owned, clientReqId: "pb2" });
    step(h);
    assert.equal(resultsOf(h, "b").at(-1)?.detail, "owned");
    step(h, 300);
    h.runtime.enqueue("b", C2S.MmoWorldPickup, { lootId: owned, clientReqId: "pb3" });
    step(h);
    assert.equal(resultsOf(h, "b").at(-1)?.result, "ok", "超时放开");
    // 探针伤害（无仇恨）打死 ⇒ 无主
    const other = [...h.mode.__probe.entities().values()].find((e) => e.kind === "creature" && e.templateId === "slime" && e.id !== slime.id)!;
    h.mode.__probe.damage(other.id, 30);
    step(h);
    const free = [...h.mode.__probe.loot().values()].find((d) => d.x === other.x && d.y === other.y)!;
    assert.equal(free.ownerCharacterId, null);
    // 快照往返：owner 与到期 tick 按 tick 差重排
    const ownedAgain = h.mode.__probe.spawnLoot(GREYBOX_ITEMS.gel, 1, 600, 600, a.characterId);
    const snapshot = h.runtime.takeCheckpoint(true)!.instance as MmoInstanceSnapshot;
    const entry = snapshot.loot!.find((d) => d.id === ownedAgain)!;
    assert.deepEqual([entry.ownerCharacterId, entry.ownerUntilTick], [a.characterId, h.state.tick + 300]);
    const r = lootHarness();
    await activeWorld(r, "greybox", snapshot);
    const back = r.mode.__probe.loot().get(ownedAgain)!;
    assert.deepEqual([back.ownerCharacterId, back.ownerUntilTick], [a.characterId, 300], "新分线 tick 从 0 起 ⇒ 到期重排");
});

test("背包（MK3-B1）：进图私有流带预热的 bag、装备属性进基础攻防；拾取后轮询 loadBag：变了 ⇒ 再发一次 bag 并停；没变 ⇒ 轮询到期停；离座清", async () => {
    let bagState: IMmoBagWire = { rev: 1, items: [{ id: "i1", itemId: GREYBOX_ITEMS.blade, count: 1, location: "equip", slot: 0, rev: 1 }] };
    let loads = 0;
    const h = harness(DUMMY_CONTENT, null, {
        checkpoint: { kitId: "mmo", port: new MemoryCheckpointPort(), schema: MMO_WORLD_CHECKPOINT_SCHEMA, eventTable: MMO_WORLD_EVENT_TABLE },
        loadBag: async () => { loads += 1; return bagState; }, bagRefreshEveryTicks: 5, bagRefreshForTicks: 30,
    });
    await activeWorld(h);
    await seat(h, "a", "p-a", personaAt(600, 600));
    step(h);
    const first = privatesOf(drain(h, "a"));
    assert.deepEqual([first.length, first[0]?.bag?.items.map((item) => item.id)], [1, ["i1"]], "进图私有流带预热的 bag");
    const a = h.mode.__probe.moverOf("a")!;
    assert.deepEqual([a.attack, a.defense], [12, 2], "战士 10 攻 + 锈剑 2");
    step(h, 3);
    assert.equal(privatesOf(drain(h, "a")).length, 0, "背包没变不重发");
    const id = h.mode.__probe.spawnLoot(GREYBOX_ITEMS.gel, 1, 610, 600);
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: id, clientReqId: "p1" });
    step(h);
    assert.deepEqual([resultsOf(h, "a").at(-1)?.result, h.mode.__probe.bagRefreshing()], ["ok", ["a"]], "拾取后开始轮询");
    const loadsBefore = loads;
    step(h, 5);
    await new Promise((resolve) => setImmediate(resolve));
    step(h);
    assert.deepEqual([loads > loadsBefore, privatesOf(drain(h, "a")).length, h.mode.__probe.bagRefreshing()], [true, 0, ["a"]], "没变 ⇒ 不发、继续轮询");
    bagState = { rev: 2, items: [...bagState.items, { id: "i2", itemId: GREYBOX_ITEMS.gel, count: 1, location: "bag", slot: 0, rev: 0 }] };
    step(h, 5);
    await new Promise((resolve) => setImmediate(resolve));
    step(h);
    const changed = privatesOf(drain(h, "a"));
    assert.deepEqual([changed.length, changed[0]?.bag?.items.length, h.mode.__probe.bagRefreshing()], [1, 2, []], "变了 ⇒ 再发一次 bag 并停");
    // 没变则轮询到期停（30 步）
    h.runtime.enqueue("a", C2S.MmoWorldPickup, { lootId: h.mode.__probe.spawnLoot(GREYBOX_ITEMS.gel, 1, 605, 600), clientReqId: "p2" });
    step(h, 40);
    await new Promise((resolve) => setImmediate(resolve));
    step(h);
    assert.deepEqual([h.mode.__probe.bagRefreshing(), privatesOf(drain(h, "a")).length], [[], 0], "到期停、不发");
    h.runtime.leave("a", "left");
    assert.equal(h.mode.__probe.bagOf("a"), null, "离座清");
});

test("角色保存定稿（MK3-B2）：坏角色快照（多键 / 非数）⇒ 当无检查点从出生点满血进图并记 bad-snapshot；好快照照常回灌", async () => {
    const h = harness();
    await activeWorld(h);
    const bad = buildCheckpointEnvelope({ rev: 3, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 2, snapshot: { mapId: "greybox", x: 1500, y: 700, hp: 40, mp: 10, junk: true } });
    await seat(h, "a", "p-a", bad);
    const a = h.mode.__probe.moverOf("a")!;
    assert.deepEqual([a.x, a.y, a.hp, h.mode.__probe.log.includes("enter:a:bad-snapshot")], [1000, 1000, 100, true], "坏快照 ⇒ 出生点满血 + 日志");
    const good = buildCheckpointEnvelope({ rev: 3, eventOffset: 0, authorityEpoch: 1, controlEpoch: 1, schemaVersion: 2, snapshot: { mapId: "greybox", x: 1500, y: 700, hp: 40, mp: 10 } });
    await seat(h, "b", "p-b", good);
    const b = h.mode.__probe.moverOf("b")!;
    assert.deepEqual([b.x, b.y, b.hp, b.mp], [1500, 700, 40, 10]);
});
