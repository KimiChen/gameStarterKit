/**
 * 入口分组页逻辑（docs/PLUGIN.md §6.1 的机检）：
 *  - 成员顺序 = 宿主 placement 的**声明序**（⛔ 不按 pluginId 重排——那是设置面板列表的规则）；
 *  - 可用性叠加、activate 拒绝与 retry 走**同一条** launch 通道，口径与设置面板逐字一致；
 *  - 真仓 placement 自洽：host.json 里每个分组的成员都能在全量 contribution 里解析出来。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATED_HOST, GENERATED_MENU_CONTRIBUTIONS } from "../src/generated/plugins.generated";
import { EntryGroupLogic, type EntryGroupItemInput } from "../src/logic/page/EntryGroupLogic";
import type { PluginAvailability } from "../src/logic/page/SettingsLogic";

function makeHarness(items: readonly Omit<EntryGroupItemInput, "launch">[], title = "竞技场") {
  const launched: string[] = [];
  const availability = new Map<string, PluginAvailability>();
  let renders = 0;
  const logic = new EntryGroupLogic({
    availabilityOf: (pluginId) => availability.get(pluginId) ?? "available",
  }, title);
  logic.onChanged = () => { renders++; };
  logic.setItems(items.map((item) => ({ ...item, launch: () => { launched.push(item.entryId); } })));
  return {
    logic,
    launched,
    renders: () => renders,
    setAvailability: (pluginId: string, value: PluginAvailability) => { availability.set(pluginId, value); },
  };
}

const ARENA_ITEMS = [
  { entryId: "board", pluginId: "arena", label: "竞技场" },
  { entryId: "capture", pluginId: "arena", label: "占领赛" },
  { entryId: "duel", pluginId: "arena", label: "决斗" },
  { entryId: "arenaShop", pluginId: "arenaShop", label: "竞技场商店" },
];

test("组内顺序 = placement 声明序（⛔ 不按 pluginId 字母序重排）", () => {
  const harness = makeHarness(ARENA_ITEMS);
  assert.equal(harness.logic.groupTitle(), "竞技场");
  assert.deepEqual(harness.logic.entries().map((item) => item.entryId),
    ["board", "capture", "duel", "arenaShop"]);

  // ⚠ 上面那组的声明序恰好**等于**字母序（arena < arenaShop），单靠它证明不了「保序」。
  // 用一组故意与字母序相反的成员再测一次——设置面板那条列表会把它排成 alpha/zeta，
  // 分组页必须原样保留宿主写下的顺序。
  const reversed = makeHarness([
    { entryId: "zEntry", pluginId: "zeta", label: "Z" },
    { entryId: "aEntry", pluginId: "alpha", label: "A" },
  ], "逆序组");
  assert.deepEqual(reversed.logic.entries().map((item) => `${item.pluginId}/${item.entryId}`),
    ["zeta/zEntry", "alpha/aEntry"], "⛔ 不许重排——组内顺序是宿主的编排意图");
});

test("可用条目点击走 launch；failed/disabled 置灰、activate 拒绝、retry 仍走同一通道", async () => {
  const harness = makeHarness(ARENA_ITEMS);
  await harness.logic.activate("board");
  assert.deepEqual(harness.launched, ["board"]);

  harness.setAvailability("arenaShop", "failed");
  const shop = harness.logic.entries().find((item) => item.entryId === "arenaShop");
  assert.equal(shop?.enabled, false);
  assert.equal(shop?.disabledReason, "插件装载失败");
  await harness.logic.activate("arenaShop");
  assert.deepEqual(harness.launched, ["board"], "不可用条目 activate ⛔ 必须拒绝");
  await harness.logic.retry("arenaShop");
  assert.deepEqual(harness.launched, ["board", "arenaShop"], "retry 走的是同一条 launch 通道");
  await harness.logic.retry("board");
  assert.deepEqual(harness.launched, ["board", "arenaShop"], "可用条目 retry 是 no-op");

  harness.setAvailability("arena", "disabled");
  assert.equal(harness.logic.entries().find((item) => item.entryId === "board")?.disabledReason, "插件已停用");
});

test("launch 之后重绘一次（可用性可能因这次 launch 翻转）", async () => {
  const harness = makeHarness(ARENA_ITEMS);
  const before = harness.renders();
  await harness.logic.activate("board");
  assert.ok(harness.renders() > before, "activate 必须触发重绘");
});

test("真仓 placement：host.json 每个分组的成员都能在全量 contribution 里解析出来", () => {
  assert.ok(GENERATED_HOST.groups.length > 0, "前置：host.json 必须真的声明了分组");
  const known = new Set(GENERATED_MENU_CONTRIBUTIONS.map((item) => `${item.pluginId}/${item.entryId}`));
  for (const group of GENERATED_HOST.groups) {
    assert.ok(group.members.length >= 2, `分组 ${group.id} 至少要收 2 条入口`);
    for (const member of group.members) {
      assert.ok(known.has(`${member.pluginId}/${member.entryId}`),
        `分组 ${group.id} 的成员 ${member.pluginId}/${member.entryId} 必须是真实 contribution`);
    }
  }
});
