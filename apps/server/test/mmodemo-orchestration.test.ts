/**
 * mmodemo 编排（docs/MMO.md §9.2 / MMO-PLAN MG0-B2 验收「harness 重放：boss 周期、伏击冷却、奖励只发同队在场者、预算内」）：
 * 只用 kit 服务端 `api/orchestration` 门面的 `createOrchestrationHarness`（内存世界 + 同一运行器）。
 * 变异验证：bossTimer 不查狼穴里的活 boss → 「boss 还活着不叠刷」转红；ambush 不比冷却 → 「冷却内再进不刷」转红；
 * onCreatureDied 不 slice 到 50 → 「70 人队伍不撑爆预算」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IEntityView, OrchestrationEvent } from "@game/shared/kits/mmo/api/orchestration/index";
import { ORCH_MAX_COMMANDS_PER_TICK } from "@game/shared/kits/mmo/api/orchestration/index";
import { createOrchestrationHarness, regionContains } from "../src/kits/mmo/api/orchestration/index";
import { indexContentPack } from "@game/shared/kits/mmo/api/content/index";
import { orchestration } from "../src/core/mmodemo/mmoOrchestration";
import { AMBUSH_AT_VAR, AMBUSH_COOLDOWN_TICKS, AMBUSH_DESPAWN_MS, AMBUSH_TAG, AMBUSH_WOLVES } from "../src/core/mmodemo/encounters/ambush";
import { BOSS_KILLS_VAR, BOSS_PERIOD_MS, BOSS_REWARD_ITEM_ID, BOSS_REWARD_MAX_MEMBERS, BOSS_TAG, BOSS_TEMPLATE_ID, DEN_REGION_ID } from "../src/core/mmodemo/encounters/bossTimer";
import { TRADE_GIFT_ITEM_ID } from "../src/core/mmodemo/encounters/merchant";
import { loadDemoVale } from "./mmodemo-content.test";

const PACK = indexContentPack(loadDemoVale());
const MAP = "demoVale";
const STEP_MS = 50;
const BOSS_PERIOD_TICKS = BOSS_PERIOD_MS / STEP_MS;
const character = (id: string, x: number, y: number, factionId = "dawn"): IEntityView =>
    ({ id: `char:${id}`, kind: "character", templateId: "fighter", name: id, x, y, hp: 100, hpMax: 120, level: 1, factionId, tag: null, alive: true, characterId: `c-${id}` });
const bossAlive = (x = 1900, y = 1900): IEntityView =>
    ({ id: "orch:demoVale:1", kind: "creature", templateId: BOSS_TEMPLATE_ID, name: "头狼", x, y, hp: 600, hpMax: 600, level: 8, factionId: null, tag: BOSS_TAG, alive: true, characterId: null });
const party = (leader: string, ...members: string[]) => Object.fromEntries([leader, ...members].map((id) => [`char:${id}`, [leader, ...members].map((m) => `char:${m}`)]));
const INSTANCE_STARTED: OrchestrationEvent = { kind: "instanceStarted", recovered: false, checkpointRev: 0 };

test("定时 boss：instanceStarted 起 10 min 到点在狼穴刷一只 tag=boss 的头狼 + notice + sayWorld；周期重复；狼穴里还活着就不叠刷", () => {
    const h = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 7 });
    assert.deepEqual(h.emit(INSTANCE_STARTED, 0).effects, [], "timer 是本地命令，不出 effects");
    assert.deepEqual(h.advance(BOSS_PERIOD_TICKS - 1), [], "到点前无事");
    const effects = h.advance(1);
    assert.deepEqual(effects.map((effect) => effect.op), ["spawn", "notice", "sayWorld"]);
    const spawn = effects[0]!;
    assert.equal(spawn.op, "spawn");
    if (spawn.op !== "spawn") return;
    assert.deepEqual([spawn.templateId, spawn.tag], [BOSS_TEMPLATE_ID, BOSS_TAG]);
    const den = PACK.regionsByMap.get(MAP)!.find((region) => region.regionId === DEN_REGION_ID)!;
    assert.ok(regionContains(den, spawn.pos), "刷在狼穴区域内");
    assert.equal(h.advance(BOSS_PERIOD_TICKS).filter((effect) => effect.op === "spawn").length, 1, "repeat：下一周期再刷");
    const busy = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 7, entities: [bossAlive()] });
    busy.emit(INSTANCE_STARTED, 0);
    assert.deepEqual(busy.advance(BOSS_PERIOD_TICKS), [], "boss 还活着不叠刷");
});

test("boss 击杀奖励只发击杀者同队且在本分线的成员；bossKills durable 累计；非 boss 死亡不发", () => {
    const entities = [character("a", 1900, 1900), character("b", 1850, 1900), character("c", 1800, 1900)];
    const h = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 3, entities, parties: party("a", "b") });
    const died: OrchestrationEvent = { kind: "creatureDied", entityId: "orch:demoVale:1", templateId: BOSS_TEMPLATE_ID, tag: BOSS_TAG, killerEntityId: "char:a", pos: { x: 1900, y: 1900 } };
    const first = h.emit(died, 10);
    assert.equal(first.suspended, null);
    assert.deepEqual(first.effects.map((effect) => (effect.op === "grantItem" ? [effect.toCharacterId, effect.itemTemplateId, effect.count] : effect.op)), [["c-a", BOSS_REWARD_ITEM_ID, 1], ["c-b", BOSS_REWARD_ITEM_ID, 1]], "c 不在队里不发");
    assert.equal(h.vars()[BOSS_KILLS_VAR], 1);
    h.emit(died, 20);
    assert.equal(h.vars()[BOSS_KILLS_VAR], 2, "累计");
    assert.deepEqual(h.emit({ kind: "creatureDied", entityId: "x", templateId: "wolf", killerEntityId: "char:a", pos: { x: 1400, y: 1500 } }, 30).effects, [], "普通怪不发");
    assert.deepEqual(h.emit({ kind: "creatureDied", entityId: "y", templateId: BOSS_TEMPLATE_ID, tag: BOSS_TAG, pos: { x: 1900, y: 1900 } }, 40).effects, [], "无击杀者不发");
});

test("70 人大队伍：奖励封顶 50 条 + 1 条 setVar ≤ 64，不触发 suspend", () => {
    const ids = Array.from({ length: 70 }, (_u, i) => `m${i}`);
    const entities = ids.map((id) => character(id, 1900, 1900));
    const h = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 1, entities, parties: party(ids[0]!, ...ids.slice(1)) });
    const result = h.emit({ kind: "creatureDied", entityId: "orch:demoVale:1", templateId: BOSS_TEMPLATE_ID, tag: BOSS_TAG, killerEntityId: "char:m0", pos: { x: 1900, y: 1900 } }, 5);
    assert.equal(result.suspended, null);
    assert.equal(result.effects.length, BOSS_REWARD_MAX_MEMBERS);
    assert.ok(BOSS_REWARD_MAX_MEMBERS + 1 <= ORCH_MAX_COMMANDS_PER_TICK);
});

test("区域伏击：角色进 ambush ⇒ 3 只 tag=ambush 灰狼（120 s 收回）+ notice，冷却 60 s 内再进不刷，过冷却再刷；怪物进 / 别的区域不触发", () => {
    const a = character("a", 1450, 650);
    const h = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 11, entities: [a] });
    const enter = (entityId = "char:a", entityKind: "character" | "creature" = "character", regionId = "ambush"): OrchestrationEvent =>
        ({ kind: "regionEntered", regionId, entityId, entityKind });
    const first = h.emit(enter(), 100);
    const spawns = first.effects.filter((effect) => effect.op === "spawn");
    assert.equal(spawns.length, AMBUSH_WOLVES);
    for (const spawn of spawns) {
        if (spawn.op !== "spawn") continue;
        assert.deepEqual([spawn.templateId, spawn.tag, spawn.despawnAfterMs], ["wolf", AMBUSH_TAG, AMBUSH_DESPAWN_MS]);
        assert.ok(Math.hypot(spawn.pos.x - a.x, spawn.pos.y - a.y) < 200, "围着来者");
    }
    assert.ok(first.effects.some((effect) => effect.op === "notice"));
    assert.equal(h.vars()[AMBUSH_AT_VAR], 100);
    assert.deepEqual(h.emit(enter(), 200).effects, [], "冷却内再进不刷");
    assert.equal(h.emit(enter(), 100 + AMBUSH_COOLDOWN_TICKS).effects.filter((effect) => effect.op === "spawn").length, AMBUSH_WOLVES, "过冷却再刷");
    assert.deepEqual(h.emit(enter("orch:demoVale:9", "creature"), 5000).effects, [], "怪物进不触发");
    assert.deepEqual(h.emit(enter("char:a", "character", "den"), 5001).effects, [], "别的区域不触发");
});

test("行商：trade 交互 ⇒ 两个选项的 prompt；选领药水 ⇒ 1 瓶灰谷药水；选离开 / 未知交互 ⇒ 无", () => {
    const h = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 5, entities: [character("a", 700, 520)] });
    const prompt = h.emit({ kind: "interact", actorEntityId: "char:a", targetEntityId: "npc:merchant", interactId: "trade" }, 1).effects;
    assert.equal(prompt.length, 1);
    const cmd = prompt[0]!;
    assert.equal(cmd.op, "prompt");
    if (cmd.op !== "prompt") return;
    assert.deepEqual([cmd.toEntityId, cmd.choices.map((choice) => choice.id)], ["char:a", ["gift", "leave"]]);
    const gift = h.emit({ kind: "choice", actorEntityId: "char:a", promptId: cmd.promptId, choiceId: "gift" }, 2).effects;
    assert.deepEqual(gift.map((effect) => (effect.op === "grantItem" ? [effect.toCharacterId, effect.itemTemplateId, effect.count] : effect.op)), [["c-a", TRADE_GIFT_ITEM_ID, 1]]);
    assert.deepEqual(h.emit({ kind: "choice", actorEntityId: "char:a", promptId: cmd.promptId, choiceId: "leave" }, 3).effects, []);
    assert.deepEqual(h.emit({ kind: "interact", actorEntityId: "char:a", targetEntityId: "npc:merchant", interactId: "rob" }, 4).effects, []);
});

test("重放：同种子同事件序列逐条摘要相等；换种子伏击落点不全同", () => {
    const entities = [character("a", 1450, 650), character("b", 1900, 1900)];
    const script: { readonly event: OrchestrationEvent; readonly tick: number }[] = [
        { event: INSTANCE_STARTED, tick: 0 },
        { event: { kind: "regionEntered", regionId: "ambush", entityId: "char:a", entityKind: "character" }, tick: 100 },
        { event: { kind: "creatureDied", entityId: "orch:demoVale:1", templateId: BOSS_TEMPLATE_ID, tag: BOSS_TAG, killerEntityId: "char:b", pos: { x: 1900, y: 1900 } }, tick: 200 },
        { event: { kind: "interact", actorEntityId: "char:a", targetEntityId: "npc:merchant", interactId: "trade" }, tick: 300 },
    ];
    const h = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed: 42, entities, parties: party("b") });
    const spawnsAt = (seed: number) => {
        const other = createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: MAP, seed, entities });
        return other.emit(script[1]!.event, 100).effects.filter((effect) => effect.op === "spawn").map((effect) => (effect.op === "spawn" ? `${effect.pos.x},${effect.pos.y}` : ""));
    };
    for (const step of script) h.emit(step.event, step.tick);
    const replay = h.replay(script);
    assert.equal(replay.equal, true, JSON.stringify(replay.mismatches));
    assert.deepEqual(spawnsAt(42), spawnsAt(42), "同种子同落点");
    assert.notDeepEqual(spawnsAt(42), spawnsAt(43), "换种子落点不全同");
});
