/**
 * mmoWorld 服务端 WorldMode（MK0-B3，无头：WorldRuntime 直驱，⛔ Colyseus / DB）：
 *  - onWorldInit 按内容包为本图撒怪（三只 slime，确定性抖动在 spawn 附近）；图不在包内 ⇒ recover 拒；
 *  - onBeforeAdmit 预热角色行 → onAdmit：有角色放行、无角色拒；onEnter 落出生点或 persona 检查点位置（同图才回灌）；
 *  - move dir ⇒ 常量速度积分（120 × 0.05 = 6 / 步）并钳图；target ⇒ 直奔并到达停下；停下不再前进；
 *  - 视野流：首个 baseline = 本人 + 三只 slime；update 只在位置变时；本人私有流 hp / mp 一次；pickup / transfer ⇒ opResult rejected；
 *  - onCheckpoint：persona 快照 {mapId, x, y, hp, mp}、分线快照 creatures；onRestore 回灌怪物位置。
 * 变异验证（改哪一行 → 哪条用例转红）：mode 撒怪 count 循环改为 1 → 「三只 slime」红；onEnter 不看 restored.mapId → 「异图检查点不回灌」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { C2S, S2C, WorldPhase, type IMmoEntityWire, type IMmoWorldBaselineChunk, type IMmoWorldOpResult, type IMmoWorldPrivate, type IMmoWorldUpdate } from "@game/shared";
import { indexContentPack, validateContentPack } from "@game/shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import type { MmoCharacterRow } from "../src/kits/mmo/api/characters/index";
import { buildCheckpointEnvelope } from "../src/rooms/core/CheckpointPort";
import { WorldRuntime, type WorldCheckpointBatch } from "../src/rooms/core/WorldRuntime";
import { createMmoWorldMode, type MmoWorldMode } from "../src/rooms/modes/mmoWorld/index";
import { createRoomStateForMode, type MmoWorldRoomState } from "../src/rooms/schema/GameRoomState";
import type { MmoInstanceSnapshot, MmoPersonaSnapshot } from "../src/rooms/modes/mmoWorld/checkpoint";

const CONTENT = indexContentPack(validateContentPack(GREYBOX_PACK));
const rowOf = (personaId: string, name = "Rook"): MmoCharacterRow => ({
    characterId: `c-${personaId}`, personaId, userId: `u-${personaId}`, slot: 0, name, classId: "fighter", factionId: "dawn", level: 1, exp: 0, checkpointRev: 0, mapId: null,
});

interface Harness {
    readonly mode: MmoWorldMode;
    readonly runtime: WorldRuntime<MmoWorldRoomState>;
    readonly state: MmoWorldRoomState;
    readonly characters: Map<string, MmoCharacterRow>;
    readonly direct: { session: string; type: string; payload: unknown }[];
    readonly batches: WorldCheckpointBatch[];
    clock: number;
}

function harness(): Harness {
    const characters = new Map<string, MmoCharacterRow>();
    const mode = createMmoWorldMode({ content: CONTENT, loadCharacter: async (_sId, personaId) => characters.get(personaId) ?? null, checkpoint: null });
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

async function seat(h: Harness, session: string, personaId: string, checkpoint: ReturnType<typeof buildCheckpointEnvelope> | null = null): Promise<void> {
    h.characters.set(personaId, rowOf(personaId));
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
    assert.deepEqual([h.state.packId, h.state.packVersion, h.state.population], ["greybox", 1, 0]);
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
