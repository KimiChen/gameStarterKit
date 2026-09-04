/**
 * Home 数据驱动机制（Non-intrusive §7.4 阶段 6；fixture 驱动）：
 *  - 菜单唯一数据源 = generated menu contributions；排序 slot → order → featureId →
 *    entryId 由独立比较器重算核对；
 *  - contribution[0]（ballMove）的标题/launch target 是渲染到现 btn_enter 的那条；
 *  - HomeLogic：主入口点击唯一走 entry.launch；disabled/failed 叠加 = handler 拒绝
 *    （无 FGUI 视觉时以拒绝 + 状态查询断言表达；GList 视觉是编辑器待办）；
 *  - FeatureHost 运行时可用性叠加：install 失败的 fixture feature → failed → 入口不可用；
 *    显式重试成功 → 可用（叠加层可变、catalog 不可变）；
 *  - LaunchPort.launch：注入专用 launch 通道即走它；未注入回退 enterBattle。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEATURE_IDS,
  GENERATED_MENU_CONTRIBUTIONS,
  type GeneratedMenuContribution,
} from "../src/generated/features.generated";
import { APP_FEATURES, BUILTIN_FEATURE } from "../src/app/builtinFeature";
import { FeatureRegistry } from "../src/app/FeatureRegistry";
import { FeatureHost, type FeatureModule } from "../src/app/FeatureHost";
import { FrameScheduler } from "../src/app/FrameScheduler";
import { LifecycleBus } from "../src/app/LifecycleBus";
import { PendingOperationJournal } from "../src/app/PendingOperationJournal";
import { createAppPorts, type AppPorts } from "../src/app/ports";
import { HomeLogic, type HomeMenuEntryModel } from "../src/logic/page/HomeLogic";

function makePorts(overrides: {
  enterBattle?: () => Promise<void>;
  launch?: (target: { kind: "gameplay"; gameplayId: string }) => Promise<void>;
} = {}): AppPorts {
  return createAppPorts({
    navigation: {
      open: async () => { throw new Error("unused"); },
      replace: async () => { throw new Error("unused"); },
      back: () => {},
      close: () => {},
      closeGroup: () => {},
    } as never,
    journal: new PendingOperationJournal(),
    frameScheduler: new FrameScheduler(),
    lifecycleBus: new LifecycleBus(),
    enterBattle: overrides.enterBattle ?? (async () => {}),
    ...(overrides.launch === undefined ? {} : { launch: overrides.launch }),
    track: (unsubscribe) => unsubscribe,
  });
}

function sortedByRule(items: readonly GeneratedMenuContribution[]): GeneratedMenuContribution[] {
  return [...items].sort((left, right) => {
    if (left.slot !== right.slot) return left.slot - right.slot;
    if (left.order !== right.order) return left.order - right.order;
    if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1;
    if (left.entryId === right.entryId) return 0;
    return left.entryId < right.entryId ? -1 : 1;
  });
}

test("generated contributions 已按 slot → order → featureId → entryId 排序，contribution[0] 是 snake", () => {
  assert.ok(GENERATED_MENU_CONTRIBUTIONS.length >= 1, "菜单不得为空（Home 渲染 contribution[0]）");
  assert.deepEqual([...GENERATED_MENU_CONTRIBUTIONS], sortedByRule(GENERATED_MENU_CONTRIBUTIONS),
    "generated 排序必须与独立重算一致");
  // Snake Off 已拍板替代 ballMove 成为默认入口（2026-08-31）；ballMove 保留为可选入口
  // 与内部回归样例（⛔ 不物理删除）。
  const primary = GENERATED_MENU_CONTRIBUTIONS[0];
  assert.equal(primary.entryId, "snake");
  assert.equal(primary.featureId, "snake");
  assert.equal(primary.label, "贪吃蛇大作战");
  assert.deepEqual(primary.launch, { kind: "gameplay", gameplayId: "snake" },
    "launch target 必须指向已登记玩法（Home 不分支 gameplay，target 进 LaunchPort）");
  // FeatureRegistry 暴露同一数据源（openHome 的读取面）。
  const registry = new FeatureRegistry(APP_FEATURES);
  assert.deepEqual([...registry.menuContributions()], [...GENERATED_MENU_CONTRIBUTIONS]);
  // ballMove 保留为可选 contribution（内部回归样例）。
  assert.ok(BUILTIN_FEATURE.menu.some((item) => item.entryId === "ballMove"));
});

test("contribution 归属：拥有自己 feature 的玩法，菜单入口必须由该 feature 贡献（⛔ 不得留在 builtin）", () => {
  // §3.2 第 8 条的例外已关闭（features/snake/ 落地）：玩法只要有自己的 features/<id>/，
  // 它的 Home 入口就必须写在自己的 manifest 里，⛔ 不得再回写 built-in 的中央菜单表。
  // 反之，尚无独立 feature 的玩法（ballMove：保留为可选入口与内部回归样例）不受此约束。
  const featureIds = new Set(FEATURE_IDS);
  const misplaced = GENERATED_MENU_CONTRIBUTIONS
    .filter((item) => featureIds.has(item.launch.gameplayId) && item.featureId !== item.launch.gameplayId)
    .map((item) => `${item.featureId}/${item.entryId} → ${item.launch.gameplayId}`);
  assert.deepEqual(misplaced, [],
    "玩法自持 feature 时其 contribution 必须由自己贡献（把入口搬回 features/built-in 即红）");
  // 自洽闭合：本仓当前确实存在这样一个玩法（否则上面的过滤恒空，断言退化为永真）。
  const selfOwned = GENERATED_MENU_CONTRIBUTIONS
    .filter((item) => featureIds.has(item.launch.gameplayId));
  assert.ok(selfOwned.length >= 1, "至少一个玩法拥有自己的 feature（否则本断言无判别力）");
});

test("菜单排序：多 contribution fixture 按 slot → order → featureId → entryId（FeatureRegistry 汇总）", () => {
  const fixture = (featureId: string, entryId: string, slot: number, order: number): GeneratedMenuContribution => ({
    entryId, featureId, slot, order, label: entryId, labelKey: `menu.${entryId}`,
    launch: { kind: "gameplay", gameplayId: "ballMove" },
  });
  const registry = new FeatureRegistry([
    {
      id: "zeta", resident: false, dependencies: [], routes: [],
      menu: [fixture("zeta", "aEntry", 0, 5), fixture("zeta", "bEntry", 0, 0)],
    },
    {
      id: "alpha", resident: false, dependencies: [], routes: [],
      menu: [fixture("alpha", "cEntry", 1, 0), fixture("alpha", "dEntry", 0, 5), fixture("alpha", "aEntry", 0, 5)],
    },
  ]);
  assert.deepEqual(
    registry.menuContributions().map((item) => `${item.featureId}/${item.entryId}`),
    ["zeta/bEntry", "alpha/aEntry", "alpha/dEntry", "zeta/aEntry", "alpha/cEntry"],
    "slot 先行，order 次之，featureId 再次，entryId 兜底",
  );
});

test("HomeLogic：主入口点击唯一走 entry.launch；disabled 时 handler 拒绝；无入口回退旧回调", async () => {
  const logic = new HomeLogic();
  let launched = 0;
  let fallback = 0;
  logic.onEnterBattle = () => { fallback++; };

  // 无入口数据：回退 onEnterBattle（无头/迁移期兼容）。
  await logic.enterBattle();
  assert.deepEqual({ launched, fallback }, { launched: 0, fallback: 1 });

  const entry = (enabled: boolean): HomeMenuEntryModel => ({
    entryId: "ballMove", featureId: "builtin", label: "进入战斗", enabled,
    launch: () => { launched++; },
  });
  logic.setEntries([entry(true)]);
  await logic.enterBattle();
  assert.deepEqual({ launched, fallback }, { launched: 1, fallback: 1 },
    "入口存在时点击必须走 entry.launch，不再触发旧回调");

  // disabled/failed 叠加：不可点击占位——handler 直接拒绝（§7.4 绝不放行必然失败的入口）。
  logic.setEntries([entry(false)]);
  await logic.enterBattle();
  assert.deepEqual({ launched, fallback }, { launched: 1, fallback: 1 },
    "主入口不可用时 handler 必须拒绝（launch 与旧回调都不得触发）");
});

test("FeatureHost 可用性叠加（fixture）：install 失败 → failed 入口拒绝；显式重试成功 → 可用", async () => {
  let failNext = true;
  const module: FeatureModule = {
    install: () => {
      if (failNext) throw new Error("fixture install failed");
    },
  };
  const host = new FeatureHost([
    { id: "fx", load: () => module },
  ], { ports: makePorts(), appGeneration: 1 });

  // AppRuntime.featureAvailability 的同款映射（availability 是 catalog 之外的可变叠加层）。
  const availabilityOf = (featureId: string): "available" | "failed" | "disabled" => {
    const status = host.statusOf(featureId);
    if (status === "failed") return "failed";
    if (status === "disabled") return "disabled";
    return "available";
  };
  let launched = 0;
  const entryFor = (contribution: GeneratedMenuContribution): HomeMenuEntryModel => ({
    entryId: contribution.entryId,
    featureId: contribution.featureId,
    label: contribution.label,
    enabled: availabilityOf(contribution.featureId) === "available",
    launch: () => { launched++; },
  });
  const contribution: GeneratedMenuContribution = {
    entryId: "fxEntry", featureId: "fx", slot: 0, order: 0, label: "夹具玩法", labelKey: "menu.fx",
    launch: { kind: "gameplay", gameplayId: "ballMove" },
  };

  assert.equal(await host.launch("fx"), "failed");
  const logic = new HomeLogic();
  logic.setEntries([entryFor(contribution)]);
  assert.equal(logic.primaryEntry()?.enabled, false, "failed feature 的入口必须渲染为不可用占位");
  await logic.enterBattle();
  assert.equal(launched, 0, "failed 入口点击必须被拒绝");

  // 显式用户意图重试成功后，可用性叠加翻转，入口恢复可点击。
  failNext = false;
  assert.equal(await host.launch("fx", { userIntent: true }), "active");
  logic.setEntries([entryFor(contribution)]);
  assert.equal(logic.primaryEntry()?.enabled, true);
  await logic.enterBattle();
  assert.equal(launched, 1, "恢复可用后点击必须走 entry.launch");
});

test("LaunchPort.launch：注入专用通道即走它并携带 target；未注入回退 enterBattle", async () => {
  const seen: Array<{ kind: string; gameplayId: string }> = [];
  let entered = 0;
  const withLaunch = makePorts({
    enterBattle: async () => { entered++; },
    launch: async (target) => { seen.push(target); },
  });
  await withLaunch.launch.launch({ kind: "gameplay", gameplayId: "ballMove" });
  assert.deepEqual(seen, [{ kind: "gameplay", gameplayId: "ballMove" }]);
  assert.equal(entered, 0, "有专用 launch 时不得走 enterBattle");

  const withoutLaunch = makePorts({ enterBattle: async () => { entered++; } });
  await withoutLaunch.launch.launch({ kind: "gameplay", gameplayId: "ballMove" });
  assert.equal(entered, 1, "未注入 launch 时回退 enterBattle（兼容测试替身）");
});
