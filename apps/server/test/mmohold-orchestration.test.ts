/** MG2-B1：计分 / 易主 / 同tick批量结算 / 关点重开 / 检查点恢复 / 确定性重放。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    ORCH_MAX_COMMANDS_PER_TICK, ORCH_MAX_VARS_BYTES, defineOrchestration, varsBytesOf,
    type IEntityView, type OrchestrationCommand, type OrchestrationEvent,
} from "@game/shared/kits/mmo/api/orchestration/index";
import { indexContentPack, validateContentPack } from "@game/shared/kits/mmo/api/content/index";
import { createOrchestrationHarness } from "../src/kits/mmo/api/orchestration/index";
import { orchestration } from "../src/core/mmohold/mmoOrchestration";
import { HOLD_PACK_ID, POINT_IDS, REOPEN_MS, REWARD_CURRENCY, REWARD_ITEM_IDS, WIN_SCORE } from "../src/core/mmohold/encounters/capture";

const PACK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/plugins/mmohold/content/pack.json");
const PACK = indexContentPack(validateContentPack(JSON.parse(fs.readFileSync(PACK_FILE, "utf8"))));
const START: OrchestrationEvent = { kind: "instanceStarted", recovered: false, checkpointRev: 0 };
const tick = (value: number): OrchestrationEvent => ({ kind: "tick", tick: value, bucket: 0 });
const character = (id: string, x = 600, factionId: string | null = "dawn", alive = true): IEntityView =>
    ({ id: `char:${id}`, kind: "character", templateId: "fighter", name: id, x, y: 600, hp: alive ? 100 : 0, hpMax: 140, level: 1, factionId, tag: null, alive, characterId: id });
const build = (entities: readonly IEntityView[] = []) => createOrchestrationHarness({ module: orchestration, pack: PACK, mapId: HOLD_PACK_ID, seed: 7, entities });
const grants = (effects: readonly OrchestrationCommand[]) => effects.filter((effect) => effect.op === "grantItem" || effect.op === "grantCurrency");
function win(h: ReturnType<typeof build>, startTick = 0): readonly OrchestrationCommand[] {
    let effects: readonly OrchestrationCommand[] = [];
    for (let i = 1; i <= WIN_SCORE; i += 1) effects = h.emit(tick(startTick + i * 20), startTick + i * 20).effects;
    return effects;
}

test("多数占点与易主：每秒1分、换2只守卫；平票/无人/死亡/无阵营不计分、不抹归属", () => {
    const dawn = character("dawn-player");
    const dusk = character("dusk-player", 1500, "dusk");
    const h = build([dawn, dusk, character("dead", 600, "dusk", false), character("neutral", 600, null)]);
    h.emit(START, 0);
    const first = h.emit(tick(20), 20);
    assert.equal(first.suspended, null);
    assert.equal(first.effects.filter((effect) => effect.op === "spawn").length, 2);
    assert.equal(h.vars()["owner:pointA"], "dawn");
    assert.equal(h.vars()["score:dawn"], 1);
    assert.equal(h.publish().state["owner:pointA"], "dawn");
    Object.assign(dusk, { x: 600 });
    assert.deepEqual(h.emit(tick(40), 40).effects, [], "平票不换守卫");
    assert.equal(h.vars()["score:dawn"], 1, "平票不计分");
    Object.assign(dawn, { x: 1500 });
    const capture = h.emit(tick(60), 60);
    assert.deepEqual(capture.effects.filter((effect) => effect.op === "despawn"), [{ op: "despawn", tag: "hold:pointA:dawn" }]);
    assert.equal(capture.effects.filter((effect) => effect.op === "spawn").length, 2);
    assert.equal(h.vars()["score:dusk"], 1);
    Object.assign(dusk, { x: 1500 });
    assert.deepEqual(h.emit(tick(80), 80).effects, []);
    assert.equal(h.vars()["owner:pointA"], "dusk", "无人保留归属");
    assert.equal(h.vars()["score:dusk"], 1);
});

test("达100分：全部胜方在场者同tick双奖，含死亡者、不含敌方；关两点60秒后清零重开", () => {
    const h = build([character("winner"), character("dead-winner", 1400, "dawn", false), character("loser", 1500, "dusk")]);
    h.emit(START, 0);
    const victory = win(h);
    assert.equal(h.vars().phase, "closed");
    assert.equal(h.vars().winner, "dawn");
    assert.equal(h.vars()["score:dawn"], 100);
    assert.deepEqual(grants(victory), [
        { op: "grantItem", toCharacterIds: ["dead-winner", "winner"], itemTemplateId: REWARD_ITEM_IDS[0], count: 1, reason: "hold-victory" },
        { op: "grantCurrency", toCharacterIds: ["dead-winner", "winner"], amount: REWARD_CURRENCY, reason: "hold-victory" },
    ]);
    assert.deepEqual(victory.filter((effect) => effect.op === "setRegionEnabled"), POINT_IDS.map((regionId) => ({ op: "setRegionEnabled", regionId, enabled: false })));
    assert.equal(victory.filter((effect) => effect.op === "sayWorld").length, 1);
    assert.deepEqual(grants(h.emit(tick(h.tick + 20), h.tick + 20).effects), [], "闭点不重发奖");
    assert.deepEqual(grants(h.advance(REOPEN_MS / 50 - 21)), []);
    assert.equal(h.vars().phase, "closed");
    const reopened = h.advance(1);
    assert.equal(h.vars().phase, "active");
    assert.equal(h.vars().round, 2);
    assert.equal(h.vars()["score:dawn"], 0);
    assert.equal(h.vars()["score:dusk"], 0);
    assert.equal(h.vars()["owner:pointA"], "neutral");
    assert.equal(reopened.filter((effect) => effect.op === "setRegionEnabled" && effect.enabled).length, 2);
});

test("100名64字符非UUID角色：完整双奖、不截断、不存名单，最重tick低于64命令/4KB vars", () => {
    const ids = Array.from({ length: 100 }, (_unused, i) => `${i}-`.padEnd(64, "x"));
    const commandCounts: number[] = [];
    const module = defineOrchestration({ ...orchestration, handle: (event, api) => {
        const commands = orchestration.handle(event, api);
        commandCounts.push(commands.length);
        return commands;
    } });
    const h = createOrchestrationHarness({ module, pack: PACK, mapId: HOLD_PACK_ID, seed: 9, entities: ids.map((id) => character(id)) });
    h.emit(START, 0);
    const rewards = grants(win(h));
    assert.equal(rewards.length, 2);
    for (const reward of rewards) {
        if (reward.op !== "grantItem" && reward.op !== "grantCurrency") continue;
        assert.deepEqual(reward.toCharacterIds, [...ids].sort());
    }
    assert.ok(commandCounts.every((count) => count <= ORCH_MAX_COMMANDS_PER_TICK));
    assert.ok(varsBytesOf(h.vars()) < ORCH_MAX_VARS_BYTES);
    assert.ok(Object.values(h.vars()).every((value) => typeof value !== "string" || value.length < 20));
});

test("双点同时达标：奇数轮曙光、偶数轮暮光；一方占两点时每秒2分", () => {
    const h = build([character("dawn", 600), character("dusk", 1000, "dusk")]);
    h.emit(START, 0);
    win(h);
    assert.equal(h.vars().winner, "dawn");
    h.emit({ kind: "timer", timerId: "reopen", tag: "" }, h.tick + 1200);
    win(h, h.tick);
    assert.equal(h.vars().winner, "dusk");
    const both = build([character("west", 600), character("east", 1000)]);
    both.emit(START, 0);
    both.emit(tick(20), 20);
    assert.equal(both.vars()["score:dawn"], 2);
});

test("公开harness检查点恢复：闭点状态与奖励同批durable；恢复不重发、不重设60秒；剩余30秒到点重开", () => {
    const commands: OrchestrationCommand[][] = [];
    const module = defineOrchestration({ ...orchestration, handle: (event, api) => {
        const result = orchestration.handle(event, api);
        commands.push([...result]);
        return result;
    } });
    const make = () => createOrchestrationHarness({ module, pack: PACK, mapId: HOLD_PACK_ID, seed: 7, entities: [character("winner")] });
    const original = make();
    original.emit(START, 0);
    win(original);
    assert.ok(commands.at(-1)!.some((command) => command.op === "setVar" && command.key === "phase" && command.durable));
    original.advance(600);
    const checkpoint = original.snapshot();
    assert.equal(checkpoint.vars.phase, "closed");
    assert.deepEqual(checkpoint.regions, { pointA: false, pointB: false });
    const recovered = make();
    recovered.restore(checkpoint);
    assert.deepEqual(grants(recovered.emit({ kind: "instanceStarted", recovered: true, checkpointRev: 8 }, 0).effects), []);
    assert.equal(recovered.snapshot().timers.find((timer) => timer.id === "reopen")?.dueTick, 600);
    assert.deepEqual(grants(recovered.advance(599)), []);
    assert.equal(recovered.vars().phase, "closed");
    assert.deepEqual(grants(recovered.advance(1)), []);
    assert.equal(recovered.vars().phase, "active");
    assert.equal(recovered.vars().round, 2);
    assert.deepEqual(recovered.snapshot().regions, { pointA: true, pointB: true });
    assert.ok(commands.at(-1)!.some((command) => command.op === "setVar" && command.key === "round" && command.durable));
});

test("重放与预算：同种子事件摘要相等；替换handler注入65命令整批作废", () => {
    const h = build([character("dawn")]);
    const script = [{ event: START, tick: 0 }, ...Array.from({ length: 12 }, (_unused, i) => ({ event: tick((i + 1) * 20), tick: (i + 1) * 20 }))];
    for (const entry of script) h.emit(entry.event, entry.tick);
    assert.equal(h.replay(script).equal, true);
    const bad = defineOrchestration({ ...orchestration, handle: () => Array.from({ length: 65 }, (_unused, i) => ({ op: "setVar" as const, key: `test${i}`, value: i })) });
    const flooded = createOrchestrationHarness({ module: bad, pack: PACK, mapId: HOLD_PACK_ID, seed: 1 });
    assert.equal(flooded.emit(START, 0).suspended, "commands");
    assert.deepEqual(flooded.vars(), {});
});
