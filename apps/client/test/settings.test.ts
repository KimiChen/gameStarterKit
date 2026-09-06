/**
 * 设置面板逻辑（docs/PLUGIN.md §6/§6.1 的机检）：
 *  - 插件入口列表是**全量** contribution 按 **pluginId 字母序**（⛔ 不是宿主 placement 的
 *    首屏序，也不是声明序）：用例内自洽核对「全量 > 首屏 placement」与「独立重算的字母序」；
 *  - 点击走注入的 launch；不可用（failed/disabled）条目置灰且 activate 拒绝，
 *    显式 retry 仍走**同一条** launch 通道（宿主侧 userIntent 闸）；
 *  - 音乐/音效开关：成功保留乐观值、失败**回滚 UI** 并给可重试提示；
 *  - 合规/未实现项一律置灰占位且逐条带原因（⛔ 不做假实现）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATED_HOST, GENERATED_MENU_CONTRIBUTIONS } from "../src/generated/plugins.generated";
import {
  SETTINGS_PLACEHOLDERS,
  SettingsLogic,
  type PluginAvailability,
  type SettingsDeps,
  type SettingsGroupEntryInput,
  type SettingsPluginEntryInput,
  type SettingsProfilePatch,
} from "../src/logic/page/SettingsLogic";

interface Harness {
  readonly logic: SettingsLogic;
  readonly patches: SettingsProfilePatch[];
  readonly launched: string[];
  readonly renders: () => number;
  setAvailability(pluginId: string, availability: PluginAvailability): void;
  failNextWrite(reason?: string): void;
}

function makeHarness(entries: readonly SettingsPluginEntryInput[] = []): Harness {
  const patches: SettingsProfilePatch[] = [];
  const launched: string[] = [];
  const availability = new Map<string, PluginAvailability>();
  let failWrite: string | null = null;
  let renders = 0;
  const deps: SettingsDeps = {
    updateProfile: async (patch) => {
      patches.push(patch);
      if (failWrite !== null) {
        const reason = failWrite;
        failWrite = null;
        throw new Error(reason);
      }
    },
    availabilityOf: (pluginId) => availability.get(pluginId) ?? "available",
  };
  const logic = new SettingsLogic(deps);
  logic.onChanged = () => { renders++; };
  logic.setEntries(entries.map((entry) => ({
    ...entry,
    launch: () => { launched.push(entry.entryId); return entry.launch(); },
  })));
  return {
    logic,
    patches,
    launched,
    renders: () => renders,
    setAvailability: (pluginId, value) => { availability.set(pluginId, value); },
    failNextWrite: (reason = "network down") => { failWrite = reason; },
  };
}

function contributionEntries(): SettingsPluginEntryInput[] {
  return GENERATED_MENU_CONTRIBUTIONS.map((item) => ({
    entryId: item.entryId,
    pluginId: item.pluginId,
    label: item.label,
    launch: () => {},
  }));
}

test("插件入口是全量 contribution 按 pluginId 字母序（⛔ 不是宿主 placement 的首屏序）", () => {
  const alphabetical = [...GENERATED_MENU_CONTRIBUTIONS]
    .map((item) => `${item.pluginId}/${item.entryId}`)
    .sort();
  // 自洽闭合：全量入口必须多于首屏 placement，否则「全量 vs 首屏」无判别力（菜单被掏空/全上首屏）。
  assert.ok(GENERATED_MENU_CONTRIBUTIONS.length > GENERATED_HOST.home.length,
    "全量 contribution 必须多于 host.json 的 home placement");

  const harness = makeHarness(contributionEntries());
  assert.deepEqual(harness.logic.pluginEntries().map((entry) => `${entry.pluginId}/${entry.entryId}`), alphabetical,
    "设置面板列表必须是全量入口的 pluginId 字母序（按 placement 裁剪或改成声明序即红）");
  const placed = new Set(GENERATED_HOST.home.map((entry) => entry.entryId));
  assert.ok(harness.logic.pluginEntries().some((entry) => !placed.has(entry.entryId)),
    "未上首屏的入口（回归样例 ballMove 一类）必须仍出现在设置面板");
});

/**
 * 入口分组（PLUGIN.md §6.1）：一个产品级入口在设置面板里只占**一行**。
 * 竞技场由 kit `arena`（棋盘/占领赛/决斗）与插件 `arenaShop`（商店）共四条 contribution 组成，
 * 平铺就是四行并列；宿主 placement 把它们收进 arenaHub 一行，点进去才见成员。
 */
test("分组：成员 ⛔ 不在设置面板单独出现，整组只占一行且点击走组的 launch", async () => {
  const opened: string[] = [];
  const entries: SettingsPluginEntryInput[] = [
    { entryId: "board", pluginId: "arena", label: "竞技场", groupId: "arenaHub", launch: () => {} },
    { entryId: "capture", pluginId: "arena", label: "占领赛", groupId: "arenaHub", launch: () => {} },
    { entryId: "arenaShop", pluginId: "arenaShop", label: "竞技场商店", groupId: "arenaHub", launch: () => {} },
    { entryId: "redeem", pluginId: "redeem", label: "兑换码", groupId: null, launch: () => {} },
  ];
  const harness = makeHarness(entries);
  const groups: SettingsGroupEntryInput[] = [{
    groupId: "arenaHub",
    label: "竞技场",
    pluginIds: ["arena", "arenaShop"],
    launch: () => { opened.push("arenaHub"); },
  }];
  harness.logic.setGroups(groups);
  assert.deepEqual(harness.logic.pluginEntries().map((item) => `${item.pluginId}/${item.entryId}`),
    ["arenaHub/arenaHub", "redeem/redeem"],
    "三条成员折成一行；未分组的入口照常在列表里");
  assert.equal(harness.logic.pluginEntries()[0]?.label, "竞技场");
  await harness.logic.activate("arenaHub");
  assert.deepEqual(opened, ["arenaHub"], "点分组行走组的 launch（打开分组页）");
  assert.deepEqual(harness.launched, [], "⛔ 不得顺手触发任何成员自己的 launch");
  await harness.logic.activate("board");
  assert.deepEqual(harness.launched, [], "成员已不在本列表里，activate 它必须是 no-op");
});

test("分组行可用性：组内还有可用成员就不置灰（⛔ 一个插件 failed 不该屏蔽同组其他人）", () => {
  const entries: SettingsPluginEntryInput[] = [
    { entryId: "board", pluginId: "arena", label: "竞技场", groupId: "arenaHub", launch: () => {} },
    { entryId: "arenaShop", pluginId: "arenaShop", label: "竞技场商店", groupId: "arenaHub", launch: () => {} },
  ];
  const harness = makeHarness(entries);
  harness.logic.setGroups([{ groupId: "arenaHub", label: "竞技场", pluginIds: ["arena", "arenaShop"], launch: () => {} }]);
  harness.setAvailability("arenaShop", "failed");
  assert.equal(harness.logic.pluginEntries()[0]?.enabled, true, "只坏了一个成员，分组入口仍可进");
  harness.setAvailability("arena", "failed");
  const row = harness.logic.pluginEntries()[0];
  assert.equal(row?.enabled, false, "组内全不可用才置灰");
  assert.equal(row?.disabledReason, "组内入口都不可用");
});

test("真仓 placement：host.json 的分组真的把 arena 四条入口收成了一行", () => {
  assert.ok(GENERATED_HOST.groups.length > 0, "前置：host.json 必须真的声明了分组，否则本用例恒真");
  const memberIds = new Set(
    GENERATED_HOST.groups.flatMap((group) => group.members.map((item) => `${item.pluginId}/${item.entryId}`)));
  const harness = makeHarness(contributionEntries().map((entry) => ({
    ...entry,
    groupId: memberIds.has(`${entry.pluginId}/${entry.entryId}`)
      ? (GENERATED_HOST.groups.find((group) => group.members
        .some((item) => item.pluginId === entry.pluginId && item.entryId === entry.entryId))?.id ?? null)
      : null,
  })));
  harness.logic.setGroups(GENERATED_HOST.groups.map((group) => ({
    groupId: group.id,
    label: group.label,
    pluginIds: [...new Set(group.members.map((item) => item.pluginId))],
    launch: () => {},
  })));
  const rows = harness.logic.pluginEntries().map((item) => `${item.pluginId}/${item.entryId}`);
  assert.equal(rows.length, GENERATED_MENU_CONTRIBUTIONS.length - memberIds.size + GENERATED_HOST.groups.length);
  for (const member of memberIds) {
    assert.equal(rows.includes(member), false, `组内成员 ${member} ⛔ 不得在设置面板单独出现`);
  }
  assert.ok(rows.includes("arenaHub/arenaHub"), "竞技场这一组必须在面板里占一行");
});

test("同一 plugin 的多条入口以 entryId 兜底排序（确定性，与语言无关）", () => {
  const entry = (pluginId: string, entryId: string): SettingsPluginEntryInput => ({
    entryId, pluginId, label: entryId, launch: () => {},
  });
  const harness = makeHarness([
    entry("zeta", "bEntry"), entry("alpha", "zEntry"), entry("alpha", "aEntry"), entry("zeta", "aEntry"),
  ]);
  assert.deepEqual(
    harness.logic.pluginEntries().map((item) => `${item.pluginId}/${item.entryId}`),
    ["alpha/aEntry", "alpha/zEntry", "zeta/aEntry", "zeta/bEntry"],
  );
});

test("可用条目点击走 launch；failed/disabled 条目置灰、activate 拒绝、retry 仍走同一通道", async () => {
  const harness = makeHarness(contributionEntries());
  const first = harness.logic.pluginEntries()[0];
  await harness.logic.activate(first.entryId);
  assert.deepEqual(harness.launched, [first.entryId], "可用条目点击必须走注入的 launch");

  for (const availability of ["failed", "disabled"] as const) {
    harness.setAvailability(first.pluginId, availability);
    const model = harness.logic.pluginEntries().find((item) => item.entryId === first.entryId);
    assert.equal(model?.enabled, false, `${availability}: 不可用条目必须置灰`);
    assert.ok((model?.disabledReason ?? "").length > 0, `${availability}: 置灰条目必须带原因`);

    const before = harness.launched.length;
    await harness.logic.activate(first.entryId);
    assert.equal(harness.launched.length, before, `${availability}: 置灰条目的普通点击必须被拒绝`);

    await harness.logic.retry(first.entryId);
    assert.deepEqual(harness.launched.slice(before), [first.entryId],
      `${availability}: 显式重试必须走同一条 launch 通道（宿主侧 userIntent 闸）`);
  }

  // 可用条目没有「重试」语义（重试只对置灰条目开放）。
  harness.setAvailability(first.pluginId, "available");
  const before = harness.launched.length;
  await harness.logic.retry(first.entryId);
  assert.equal(harness.launched.length, before, "可用条目不提供重试入口");
});

test("音频开关成功：乐观翻转后保留新值，幂等写只带被改的那个字段", async () => {
  const harness = makeHarness();
  harness.logic.setProfile({ musicOn: true, sfxOn: true });
  assert.deepEqual(harness.logic.audioToggles().map((item) => item.on), [true, true]);

  await harness.logic.toggleAudio("musicOn");
  assert.deepEqual(harness.patches, [{ musicOn: false }],
    "写 payload 只带本次改动的字段（clientReqId 由宿主 sendIdempotent 负责）");
  assert.deepEqual(harness.logic.audioToggles().map((item) => item.on), [false, true]);
  assert.equal(harness.logic.noticeText(), "", "成功不得留下失败提示");

  await harness.logic.toggleAudio("sfxOn");
  assert.deepEqual(harness.patches.at(-1), { sfxOn: false });
  assert.deepEqual(harness.logic.audioToggles().map((item) => item.on), [false, false]);
});

test("音频开关失败：UI 回滚到写之前的值并给可重试提示；重试成功后提示清空", async () => {
  const harness = makeHarness();
  harness.logic.setProfile({ musicOn: true, sfxOn: false });

  harness.failNextWrite();
  await harness.logic.toggleAudio("musicOn");
  assert.deepEqual(harness.patches, [{ musicOn: false }], "失败前必须真的发过写");
  assert.equal(harness.logic.audioToggles()[0].on, true,
    "写失败必须把 UI 回滚到写之前的值（⛔ 不留一个骗人的开关）");
  assert.match(harness.logic.noticeText(), /音乐.*重试/u, "失败必须给可重试提示");
  assert.equal(harness.logic.audioToggles()[0].pending, false, "失败后必须解除在途标记");

  await harness.logic.toggleAudio("musicOn");
  assert.equal(harness.logic.audioToggles()[0].on, false, "重试成功后取新值");
  assert.equal(harness.logic.noticeText(), "", "重试成功必须清空失败提示");
  assert.equal(harness.renders() > 0, true, "每次状态变化都要通知视图重绘");
});

test("音频写单飞：在途期间的重复点击被忽略（⛔ 不排队第二次写）", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const patches: SettingsProfilePatch[] = [];
  const logic = new SettingsLogic({
    updateProfile: async (patch) => { patches.push(patch); await gate; },
    availabilityOf: () => "available",
  });
  logic.setProfile({ musicOn: true, sfxOn: true });
  const first = logic.toggleAudio("musicOn");
  assert.equal(logic.audioToggles()[0].pending, true, "在途必须标记 pending");
  await logic.toggleAudio("musicOn");
  assert.deepEqual(patches, [{ musicOn: false }], "在途期间的重复点击不得再发一次写");
  release();
  await first;
  assert.equal(logic.audioToggles()[0].pending, false);
});

test("宿主固定占位项：合规四项 + 语言全部置灰且逐条带未实现原因（兑换码是插件，⛔ 不在宿主占位里）", () => {
  const harness = makeHarness();
  const ids = harness.logic.placeholders().map((item) => item.id);
  assert.deepEqual(ids, ["language", "push", "terms", "privacy", "logUpload"],
    "占位项集合来自 PLUGIN.md §6.1 的宿主固定区块；兑换码由 plugins/redeem 插件提供，不得再占位");
  for (const item of SETTINGS_PLACEHOLDERS) {
    assert.ok(item.label.length > 0, `${item.id}: 占位项必须有标题`);
    assert.match(item.reason, /未实现/u,
      `${item.id}: 占位项必须写明未实现原因（⛔ 不得含糊成「敬请期待」）`);
  }
  assert.match(
    SETTINGS_PLACEHOLDERS.find((item) => item.id === "language")?.reason ?? "",
    /i18n/u, "语言项必须标注 i18n 未实现");
});
