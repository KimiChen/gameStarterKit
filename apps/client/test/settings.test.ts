/**
 * 设置面板逻辑（docs/PLUGIN.md §6/§6.1 的机检）：
 *  - 插件入口排序取 **featureId 字母序**，⛔ 不是 contribution 的 slot/order 序——
 *    本仓当前两种序**恰好相反**（snake 的 order 更小、builtin 的 featureId 更小），
 *    所以这条断言真的有判别力（用例内先自洽核对「两序不同」，否则退化为永真）；
 *  - 点击走注入的 launch；不可用（failed/disabled）条目置灰且 activate 拒绝，
 *    显式 retry 仍走**同一条** launch 通道（宿主侧 userIntent 闸）；
 *  - 音乐/音效开关：成功保留乐观值、失败**回滚 UI** 并给可重试提示；
 *  - 合规/未实现项一律置灰占位且逐条带原因（⛔ 不做假实现）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATED_MENU_CONTRIBUTIONS } from "../src/generated/features.generated";
import {
  SETTINGS_PLACEHOLDERS,
  SettingsLogic,
  type FeatureAvailability,
  type SettingsDeps,
  type SettingsPluginEntryInput,
  type SettingsProfilePatch,
} from "../src/logic/page/SettingsLogic";

interface Harness {
  readonly logic: SettingsLogic;
  readonly patches: SettingsProfilePatch[];
  readonly launched: string[];
  readonly renders: () => number;
  setAvailability(featureId: string, availability: FeatureAvailability): void;
  failNextWrite(reason?: string): void;
}

function makeHarness(entries: readonly SettingsPluginEntryInput[] = []): Harness {
  const patches: SettingsProfilePatch[] = [];
  const launched: string[] = [];
  const availability = new Map<string, FeatureAvailability>();
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
    availabilityOf: (featureId) => availability.get(featureId) ?? "available",
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
    setAvailability: (featureId, value) => { availability.set(featureId, value); },
    failNextWrite: (reason = "network down") => { failWrite = reason; },
  };
}

function contributionEntries(): SettingsPluginEntryInput[] {
  return GENERATED_MENU_CONTRIBUTIONS.map((item) => ({
    entryId: item.entryId,
    featureId: item.featureId,
    label: item.label,
    launch: () => {},
  }));
}

test("插件入口按 featureId 字母序（⛔ 不是 contribution 的 slot/order 序）", () => {
  const contributionOrder = GENERATED_MENU_CONTRIBUTIONS.map((item) => item.featureId);
  const alphabetical = [...contributionOrder].sort();
  // 自洽闭合：两种序必须真的不同，否则本用例没有判别力（菜单被掏空/顺序恰好一致）。
  assert.notDeepEqual(contributionOrder, alphabetical,
    "本仓的 contribution 序与 featureId 字母序必须不同，否则本断言退化为永真");

  const harness = makeHarness(contributionEntries());
  assert.deepEqual(harness.logic.pluginEntries().map((entry) => entry.featureId), alphabetical,
    "设置面板列表必须取 featureId 字母序（把排序改回声明/slot 序即红）");
});

test("同一 feature 的多条入口以 entryId 兜底排序（确定性，与语言无关）", () => {
  const entry = (featureId: string, entryId: string): SettingsPluginEntryInput => ({
    entryId, featureId, label: entryId, launch: () => {},
  });
  const harness = makeHarness([
    entry("zeta", "bEntry"), entry("alpha", "zEntry"), entry("alpha", "aEntry"), entry("zeta", "aEntry"),
  ]);
  assert.deepEqual(
    harness.logic.pluginEntries().map((item) => `${item.featureId}/${item.entryId}`),
    ["alpha/aEntry", "alpha/zEntry", "zeta/aEntry", "zeta/bEntry"],
  );
});

test("可用条目点击走 launch；failed/disabled 条目置灰、activate 拒绝、retry 仍走同一通道", async () => {
  const harness = makeHarness(contributionEntries());
  const first = harness.logic.pluginEntries()[0];
  await harness.logic.activate(first.entryId);
  assert.deepEqual(harness.launched, [first.entryId], "可用条目点击必须走注入的 launch");

  for (const availability of ["failed", "disabled"] as const) {
    harness.setAvailability(first.featureId, availability);
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
  harness.setAvailability(first.featureId, "available");
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

test("宿主固定占位项：合规四项 + 语言 + 兑换码全部置灰且逐条带未实现原因", () => {
  const harness = makeHarness();
  const ids = harness.logic.placeholders().map((item) => item.id);
  assert.deepEqual(ids, ["language", "push", "terms", "privacy", "redeemCode", "logUpload"],
    "占位项集合来自 PLUGIN.md §6.1 的宿主固定区块");
  for (const item of SETTINGS_PLACEHOLDERS) {
    assert.ok(item.label.length > 0, `${item.id}: 占位项必须有标题`);
    assert.match(item.reason, /未实现/u,
      `${item.id}: 占位项必须写明未实现原因（⛔ 不得含糊成「敬请期待」）`);
  }
  assert.match(
    SETTINGS_PLACEHOLDERS.find((item) => item.id === "language")?.reason ?? "",
    /i18n/u, "语言项必须标注 i18n 未实现");
});
