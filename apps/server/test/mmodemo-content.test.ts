/**
 * mmodemo 内容包 `demoVale`（docs/MMO.md §9.2；MG0-B1）：pack.json 过 kit `validateContentPack` / `indexContentPack`；引用完整性由 validator 保证，
 * 本用例钉插件自己的约束——职业覆盖 kit 的 MMO_CLASS_IDS（否则角色进图被拒）、boss / 区域 / NPC 存在、编排模块的 packId 与 interacts 与内容包对齐、
 * 与内置灰盒包同装载不冲突（一图一包 + 全区物品同义）。变异验证：把 pack.json 里 merchant 的 interacts 清空 → 「interacts 交叉核对」转红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { indexContentPack, mergeItemTemplates, validateContentPack, type IContentPack } from "@game/shared/kits/mmo/api/content/index";
import { MMO_CLASS_IDS } from "@game/shared/kits/mmo/api/characters/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { contentForMap, contentIndexesOf } from "../src/kits/mmo/content/registry";
import { orchestration, DEMO_VALE_PACK_ID } from "../src/core/mmodemo/mmoOrchestration";
import { BOSS_REWARD_ITEM_ID, BOSS_TEMPLATE_ID, DEN_REGION_ID } from "../src/core/mmodemo/encounters/bossTimer";
import { AMBUSH_REGION_ID, AMBUSH_WOLF_TEMPLATE_ID } from "../src/core/mmodemo/encounters/ambush";
import { MERCHANT_NPC_ID, TRADE_GIFT_ITEM_ID, TRADE_INTERACT_ID } from "../src/core/mmodemo/encounters/merchant";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_VALE_PACK_FILE = path.resolve(HERE, "../../..", "apps/plugins/mmodemo/content/pack.json");
export const loadDemoVale = (): IContentPack => validateContentPack(JSON.parse(fs.readFileSync(DEMO_VALE_PACK_FILE, "utf8")));

test("demoVale 过 kit validator：一图、职业覆盖 MMO_CLASS_IDS、boss / 区域 / NPC / 奖励物品齐全", () => {
    const pack = loadDemoVale();
    const index = indexContentPack(pack);
    assert.equal(pack.packId, DEMO_VALE_PACK_ID);
    assert.deepEqual(pack.maps.map((map) => map.mapId), ["demoVale"]);
    for (const classId of MMO_CLASS_IDS) assert.ok(index.classById.has(classId), `职业 ${classId} 必须在包内（角色进图按 classId 取模板）`);
    const boss = index.creatureById.get(BOSS_TEMPLATE_ID);
    assert.deepEqual([boss?.tier, boss?.checkpointOnDeath], ["boss", true], "boss 死亡强制检查点（§9.2）");
    assert.ok(index.creatureById.has(AMBUSH_WOLF_TEMPLATE_ID));
    const regions = index.regionsByMap.get("demoVale") ?? [];
    assert.deepEqual(regions.map((region) => region.regionId).sort(), [AMBUSH_REGION_ID, DEN_REGION_ID].sort());
    assert.ok(index.itemById.has(BOSS_REWARD_ITEM_ID) && index.itemById.has(TRADE_GIFT_ITEM_ID));
    assert.equal(pack.items.length, 10, "§9.2：物品 10");
    assert.ok(pack.spawns.every((spawn) => spawn.managed === "kit"), "boss 只由编排刷，不在 kit 刷新点里");
});

test("编排模块与内容包对齐：packId 相同；interacts 的目标是包内 NPC 且 NPC 声明了该交互；订阅的都是 kit 事件", () => {
    const pack = loadDemoVale();
    assert.equal(orchestration.packId, pack.packId);
    for (const [interactId, spec] of Object.entries(orchestration.interacts ?? {})) {
        for (const target of spec.targets) {
            const npc = pack.npcs.find((entry) => entry.npcId === target);
            const creature = pack.creatures.find((entry) => entry.templateId === target);
            const declared = npc?.interacts ?? creature?.interacts;
            assert.ok(declared !== undefined, `interact ${interactId} 的目标 ${target} 不在包内`);
            assert.ok(declared.includes(interactId), `内容包里 ${target} 未声明交互 ${interactId}（kit 启动期交叉核对会拒启）`);
        }
    }
    assert.ok(Object.keys(orchestration.interacts ?? {}).includes(TRADE_INTERACT_ID));
    assert.ok(pack.npcs.some((npc) => npc.npcId === MERCHANT_NPC_ID));
    assert.deepEqual([...orchestration.subscribes].sort(), ["choice", "creatureDied", "instanceStarted", "interact", "regionEntered", "timer"]);
});

test("与内置灰盒同装载：一图一包不撞图、全区物品 id 不撞、按图解析到本包", () => {
    const pack = loadDemoVale();
    const indexes = contentIndexesOf([{ pluginId: "mmodemo", value: pack }], GREYBOX_PACK);
    assert.equal(indexes.length, 2);
    assert.equal(mergeItemTemplates(indexes).size, pack.items.length + GREYBOX_PACK.items.length, "物品 id 全区唯一，无同名异义");
    assert.equal(contentForMap("demoVale", indexes)?.pack.packId, DEMO_VALE_PACK_ID);
    assert.equal(contentForMap("greybox", indexes)?.pack.packId, GREYBOX_PACK.packId, "灰盒图仍由内置包承载");
});
