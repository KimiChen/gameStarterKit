/**
 * mmo kit 贡献点装载（MK4-B2；docs/MMO.md §7.6「MK4 改为经贡献点装载」/ §8.6 ②③；⛔ 跑 codegen / 连库）：
 *  - kit.json 声明三个贡献点：content（data，server + client，schema = 内容包顶层形状）、presentation（module，client，export presentation）、orchestration（module，server，export orchestration）；
 *  - content schema（codegen 解释器子集）接受灰盒包 JSON、拒缺 packId / 坏 version；
 *  - 注册表组合：贡献包在前、内置灰盒兜底；contentForMap 贡献包优先；跨包 packId / mapId 重复 ⇒ 抛；坏包 ⇒ 抛（fail-closed）；
 *  - 编排交叉核对：模块 packId 不对应已收录包 ⇒ assertOrchestrationsResolvable 抛；重复 packId 登记 ⇒ 抛；
 *  - renderContributionsModule：data 贡献渲染成同源 JSON 字面量、module 贡献渲染成相对 import。
 * 变异验证：contentIndexesOf 删「一图一包」判定 → 「同图两包」红；assertOrchestrationsResolvable 不查 packId → 「未知包」红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MMO_ORCHESTRATION_VERSION, defineOrchestration } from "@game/shared/kits/mmo/api/orchestration/index";
import { GREYBOX_EAST_MAP_ID, GREYBOX_MAP_ID, GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { indexContentPack, mergeItemTemplates, validateContentPack } from "@game/shared/kits/mmo/api/content/index";
import { contentForMap, contentIndexes, contentIndexesOf } from "../src/kits/mmo/content/registry";
import { assertOrchestrationsResolvable, registerOrchestration } from "../src/kits/mmo/orchestration/registry";
import { renderContributionsModule } from "../tools/plugin-codegen/contributions";
import { parseKitRegistration, validateAgainstSchema } from "../tools/plugin-codegen/pluginManifestSchema";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const kitJson = (): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(REPO, "apps/kits/mmo/kit.json"), "utf8")) as Record<string, unknown>;
const jsonPack = (): Record<string, unknown> => JSON.parse(JSON.stringify(GREYBOX_PACK)) as Record<string, unknown>;

test("kit.json：content（data，server + client）/ presentation（module，client，export presentation）/ orchestration（module，server，export orchestration）；content schema 接受灰盒包 JSON、拒坏形状", () => {
    const reg = parseKitRegistration(kitJson(), "apps/kits/mmo/kit.json");
    const content = reg.contributions.content;
    const presentation = reg.contributions.presentation;
    const orchestration = reg.contributions.orchestration;
    assert.deepEqual([content?.kind, content?.ends, presentation?.kind, presentation?.ends, orchestration?.kind, orchestration?.ends], ["data", ["server", "client"], "module", ["client"], "module", ["server"]]);
    if (presentation?.kind === "module") assert.equal(presentation.export, "presentation");
    if (orchestration?.kind === "module") assert.equal(orchestration.export, "orchestration");
    const schema = ((kitJson().contributions as Record<string, { schema: Record<string, unknown> }>).content).schema;
    assert.doesNotThrow(() => validateAgainstSchema(schema, jsonPack(), "pack"));
    assert.throws(() => validateAgainstSchema(schema, { ...jsonPack(), packId: undefined }, "pack"), /packId/u);
    assert.throws(() => validateAgainstSchema(schema, { ...jsonPack(), version: 0 }, "pack"), /version/u);
    assert.throws(() => validateAgainstSchema(schema, { ...jsonPack(), maps: "nope" }, "pack"), /maps/u);
});

test("注册表组合：贡献包在前、内置兜底；contentForMap 贡献包优先；同 packId / 同图两包 ⇒ 抛；坏包 ⇒ 抛；生成的 contributions.generated 两端存在且空", () => {
    const east = { ...jsonPack(), packId: "east-plugin", maps: GREYBOX_PACK.maps.filter((map) => map.mapId === GREYBOX_EAST_MAP_ID).map((map) => ({ ...map, portals: [] })), spawns: GREYBOX_PACK.spawns.filter((spawn) => spawn.mapId === GREYBOX_EAST_MAP_ID), regions: [], npcs: [] };
    const builtinWestOnly = { ...jsonPack(), maps: GREYBOX_PACK.maps.filter((map) => map.mapId === GREYBOX_MAP_ID).map((map) => ({ ...map, portals: [] })), spawns: GREYBOX_PACK.spawns.filter((spawn) => spawn.mapId === GREYBOX_MAP_ID), regions: [], npcs: [] };
    const indexes = contentIndexesOf([{ pluginId: "eastPlugin", value: east }], builtinWestOnly);
    assert.deepEqual(indexes.map((index) => index.pack.packId), ["east-plugin", "greybox"], "贡献包在前、内置兜底");
    assert.deepEqual([contentForMap(GREYBOX_EAST_MAP_ID, indexes)?.pack.packId, contentForMap(GREYBOX_MAP_ID, indexes)?.pack.packId, contentForMap("nowhere", indexes)], ["east-plugin", "greybox", null]);
    assert.throws(() => contentIndexesOf([{ pluginId: "dup", value: jsonPack() }]), /packId "greybox" 重复/u, "同 packId");
    assert.throws(() => contentIndexesOf([{ pluginId: "shadow", value: { ...east, packId: "shadow" } }], jsonPack()), /一图一包/u, "同图两包");
    assert.throws(() => contentIndexesOf([{ pluginId: "bad", value: { ...east, packId: "bad", classes: [] } }], builtinWestOnly), /贡献包 plugin:bad 不合法/u, "坏包 fail-closed");
    // 生成物两端存在且形状与填充无关（MG0 起有真实插件填充，⛔ 假设为空）：每个 pluginId 都对应树上声明了 contributes.mmo 的插件
    for (const end of ["server", "client"] as const) {
        const source = fs.readFileSync(path.join(REPO, `apps/${end}/src/kits/mmo/contributions.generated.ts`), "utf8");
        assert.match(source, /export const KIT_CONTRIBUTIONS = \{/u);
        assert.match(source, /\n {4}content: \[/u, `${end} 端有 content 列表`);
        assert.match(source, end === "server" ? /\n {4}orchestration: \[/u : /\n {4}presentation: \[/u);
        for (const [, pluginId] of source.matchAll(/pluginId: "([A-Za-z0-9]+)"/gu)) {
            const manifest = JSON.parse(fs.readFileSync(path.join(REPO, `apps/plugins/${pluginId}/plugin.json`), "utf8")) as { contributes?: { mmo?: unknown } };
            assert.ok(manifest.contributes?.mmo, `${end} 端收录的 ${pluginId} 必须在树上声明 contributes.mmo`);
        }
    }
    // 生产注册表：全部贡献包 + 内置兜底都过闸（坏包在此即抛），内置灰盒永远垫底
    const live = contentIndexes();
    assert.ok(live.length >= 1);
    assert.equal(live.at(-1)?.pack.packId, GREYBOX_PACK.packId, "内置灰盒兜底");
});

test("编排交叉核对：模块 packId 不对应已收录包 ⇒ 抛；重复 packId 登记 ⇒ 抛；renderContributionsModule 渲染 data 字面量与 module import", () => {
    const module = defineOrchestration({ orchestrationVersion: MMO_ORCHESTRATION_VERSION, packId: "ghost-pack", subscribes: ["tick"], handle: () => [] });
    const unregister = registerOrchestration(module);
    try {
        assert.throws(() => registerOrchestration(module), /已有编排模块/u, "一包一模块");
        // 贡献点收录的真实模块（MG0 起有）也要能解析：用生产注册表的全部包 id，⛔ 假设只有灰盒
        const livePackIds = contentIndexes().map((index) => index.pack.packId);
        assert.throws(() => assertOrchestrationsResolvable(livePackIds), /"ghost-pack" 不对应任何已收录内容包/u);
        assert.doesNotThrow(() => assertOrchestrationsResolvable([...livePackIds, "ghost-pack"]));
    } finally {
        unregister();
    }
    const rendered = renderContributionsModule({
        kitId: "mmo", end: "server",
        ids: new Map([
            ["content", [{ kind: "data", pluginId: "mmodemo", file: "apps/plugins/mmodemo/content/pack.json", value: { packId: "demo", version: 1 } }]],
            ["orchestration", [{ kind: "module", pluginId: "mmodemo", file: "apps/server/src/core/mmodemo/mmoOrchestration.ts", exportName: "orchestration" }]],
        ]),
    });
    assert.match(rendered, /import \{ orchestration as mmodemo_orchestration \} from "\.\.\/\.\.\/core\/mmodemo\/mmoOrchestration";/u);
    assert.match(rendered, /"packId": "demo"/u);
    assert.match(rendered, /\{ pluginId: "mmodemo", value: mmodemo_orchestration \}/u);
});

test("物品 id 跨包同义：相同模板可复用，属性 / 堆叠 / 职业等不同定义装载期拒绝，包顺序不能改变资产", () => {
    const builtin = indexContentPack(validateContentPack(GREYBOX_PACK));
    const copy = { ...GREYBOX_PACK, packId: "copied-items" };
    assert.equal(mergeItemTemplates([builtin, indexContentPack(validateContentPack(copy))]).size, GREYBOX_PACK.items.length);
    const item = GREYBOX_PACK.items[0]!;
    for (const patch of [
        { name: "different" }, { presentationId: "different" }, { slot: "armor" }, { stackMax: item.stackMax + 1 },
        { classIds: ["different"] }, { price: item.price + 1 }, { attrs: { attack: 99 } },
    ]) {
        const other = indexContentPack(validateContentPack({ ...copy, items: [{ ...item, ...patch }, ...copy.items.slice(1)] }));
        for (const indexes of [[builtin, other], [other, builtin]]) assert.throws(() => mergeItemTemplates(indexes), /conflicting definitions/u);
    }
    const east = {
        ...copy,
        maps: GREYBOX_PACK.maps.filter((map) => map.mapId === GREYBOX_EAST_MAP_ID).map((map) => ({ ...map, portals: [] })),
        spawns: GREYBOX_PACK.spawns.filter((spawn) => spawn.mapId === GREYBOX_EAST_MAP_ID),
        items: [{ ...item, stackMax: item.stackMax + 1 }, ...copy.items.slice(1)],
    };
    const west = {
        ...GREYBOX_PACK,
        maps: GREYBOX_PACK.maps.filter((map) => map.mapId === GREYBOX_MAP_ID).map((map) => ({ ...map, portals: [] })),
        spawns: GREYBOX_PACK.spawns.filter((spawn) => spawn.mapId === GREYBOX_MAP_ID),
    };
    assert.throws(() => contentIndexesOf([{ pluginId: "east", value: east }], west), /conflicting definitions/u, "生产注册表必须调用跨包物品闸");
});
