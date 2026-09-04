/**
 * Home 数据驱动机制（Non-intrusive §7.4 阶段 6；fixture 驱动）：
 *  - 菜单唯一数据源 = generated menu contributions；排序 featureId → entryId 由独立比较器
 *    重算核对，并与手写 features/<dir>/feature.json 双向核对（⛔ manifest 无 slot/order）；
 *  - **位置归宿主**（docs/PLUGIN.md §6）：首屏入口顺序与默认 launch target 都来自手写
 *    features/host.json（经 codegen 生成 GENERATED_HOST），⛔ 本文件不写死是哪个玩法；
 *  - HomeLogic：主入口点击唯一走 entry.launch；disabled/failed 叠加 = handler 拒绝
 *    （无 FGUI 视觉时以拒绝 + 状态查询断言表达；GList 视觉是编辑器待办）；
 *  - FeatureHost 运行时可用性叠加：install 失败的 fixture feature → failed → 入口不可用；
 *    显式重试成功 → 可用（叠加层可变、catalog 不可变）；
 *  - LaunchPort.launch：注入专用 launch 通道即走它；未注入回退 enterBattle。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEATURE_IDS,
  GENERATED_HOST,
  GENERATED_MENU_CONTRIBUTIONS,
  type GeneratedMenuContribution,
} from "../src/generated/features.generated";
import {
  APP_FEATURES,
  BUILTIN_FEATURE,
  DEFAULT_LAUNCH_GAMEPLAY_ID,
  resolveLaunchGameplayId,
  type FeatureLaunchTarget,
} from "../src/app/builtinFeature";
import { FeatureRegistry } from "../src/app/FeatureRegistry";
import { FeatureHost, type FeatureModule } from "../src/app/FeatureHost";
import { FrameScheduler } from "../src/app/FrameScheduler";
import { LifecycleBus } from "../src/app/LifecycleBus";
import { PendingOperationJournal } from "../src/app/PendingOperationJournal";
import { createAppPorts, type AppPorts } from "../src/app/ports";
import { HomeLogic, type HomeMenuEntryModel } from "../src/logic/page/HomeLogic";

function makePorts(overrides: {
  enterBattle?: () => Promise<void>;
  launch?: (target: FeatureLaunchTarget) => Promise<void>;
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

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * 手写真源侧的菜单全集：直接读 `features/<dir>/feature.json`，按 feature id 附上 featureId。
 * ⛔ 不复用生成物——本文件要守的正是「生成汇总 ⇔ 手写 manifest」这一格。
 */
function readManifestMenu(): GeneratedMenuContribution[] {
  const featuresDir = join(REPO_ROOT, "features");
  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = JSON.parse(
        readFileSync(join(featuresDir, entry.name, "feature.json"), "utf8"),
      ) as { id: string; menu: ReadonlyArray<Omit<GeneratedMenuContribution, "featureId">> };
      return manifest.menu.map((item) => ({ ...item, featureId: manifest.id }));
    });
}

function sortedByRule(items: readonly GeneratedMenuContribution[]): GeneratedMenuContribution[] {
  return [...items].sort((left, right) => {
    if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1;
    if (left.entryId === right.entryId) return 0;
    return left.entryId < right.entryId ? -1 : 1;
  });
}

/** 手写真源侧的宿主 placement：直接读 features/host.json（⛔ 不复用生成物）。 */
function readHostManifest(): { defaultLaunch: { gameplayId: string }; home: string[] } {
  return JSON.parse(readFileSync(join(REPO_ROOT, "features/host.json"), "utf8"));
}

test("generated contributions 按 featureId → entryId 排序且 = 手写 manifest 并集；manifest ⛔ 无 slot/order", () => {
  assert.ok(GENERATED_MENU_CONTRIBUTIONS.length >= 1, "菜单不得为空");
  assert.deepEqual([...GENERATED_MENU_CONTRIBUTIONS], sortedByRule(GENERATED_MENU_CONTRIBUTIONS),
    "generated 排序必须与独立重算一致");
  const manifestMenu = readManifestMenu();
  assert.deepEqual([...GENERATED_MENU_CONTRIBUTIONS], sortedByRule(manifestMenu),
    "generated 菜单必须 = 手写 manifest 菜单并集按 featureId → entryId 排序（⛔ 无第二真源）");
  for (const item of manifestMenu as unknown as Record<string, unknown>[]) {
    assert.ok(!("slot" in item) && !("order" in item), `manifest 入口不得再声明位置字段（slot/order）：${String(item.entryId)}`);
  }
  // FeatureRegistry 暴露同一数据源（设置面板的读取面）。
  const registry = new FeatureRegistry(APP_FEATURES);
  assert.deepEqual([...registry.menuContributions()], [...GENERATED_MENU_CONTRIBUTIONS]);
  // ballMove 保留为可选 contribution（内部回归样例，⛔ 不物理删除）——这是「不得删除」
  // 的登记断言，不是「谁是默认入口」的断言。
  assert.ok(BUILTIN_FEATURE.menu.some((item) => item.entryId === "ballMove"));
});

test("位置归宿主：首屏入口顺序 = 手写 features/host.json 的 home；每条都能解析到一条 contribution", () => {
  const host = readHostManifest();
  assert.deepEqual(GENERATED_HOST.home.map((entry) => `${entry.featureId}/${entry.entryId}`), host.home,
    "GENERATED_HOST.home 必须逐字来自手写 host.json（⛔ 无第二真源）");
  const registry = new FeatureRegistry(APP_FEATURES);
  assert.deepEqual(
    registry.homeContributions().map((item) => `${item.featureId}/${item.entryId}`),
    host.home,
    "Home 渲染顺序 = 宿主 placement，⛔ 不是 contribution 的字母序/声明序",
  );
  assert.ok(registry.homeContributions().length >= 1, "框架默认宿主至少在首屏摆一条入口（Home 视觉渲染第一条）");
  const primary = registry.homeContributions()[0];
  assert.equal(primary.launch.kind, "gameplay", "首屏主入口必须是玩法启动（Home 不分支 gameplay，target 原样进 LaunchPort）");
  // 设置面板列表是全量（含未上首屏的 ballMove 回归样例）：placement 只决定首屏，不裁剪入口集合。
  assert.ok(registry.menuContributions().length > registry.homeContributions().length,
    "全量 contribution 必须多于首屏 placement（否则「位置归宿主」无判别力）");
});

test("默认 launch target = features/host.json 的 defaultLaunch：AppRuntime/Main 兜底只读生成值，⛔ 不硬编码玩法名", () => {
  // ① 值：默认兜底恒等于宿主手写声明（⛔ 不再从菜单排序推导——排序首条会静默翻成回归样例）。
  const host = readHostManifest();
  assert.equal(DEFAULT_LAUNCH_GAMEPLAY_ID, host.defaultLaunch.gameplayId,
    "默认 launch target 必须跟随 features/host.json 的 defaultLaunch（改 host.json 即换默认入口）");
  assert.equal(new FeatureRegistry(APP_FEATURES).defaultLaunchGameplayId(), host.defaultLaunch.gameplayId);
  assert.ok(
    GENERATED_MENU_CONTRIBUTIONS.some((item) => item.launch.kind === "gameplay" && item.launch.gameplayId === host.defaultLaunch.gameplayId),
    "defaultLaunch 必须有 contribution 贡献入口（生成器闸）",
  );
  // ② 解析规则：未填 / 空白 → 生成缺省；显式 id → 原样（trim）。
  assert.equal(resolveLaunchGameplayId(undefined), DEFAULT_LAUNCH_GAMEPLAY_ID);
  assert.equal(resolveLaunchGameplayId(""), DEFAULT_LAUNCH_GAMEPLAY_ID);
  assert.equal(resolveLaunchGameplayId("   "), DEFAULT_LAUNCH_GAMEPLAY_ID);
  const other = GENERATED_MENU_CONTRIBUTIONS
    .map((item) => (item.launch.kind === "gameplay" ? item.launch.gameplayId : null))
    .filter((id): id is string => id !== null && id !== DEFAULT_LAUNCH_GAMEPLAY_ID)[0];
  assert.ok(other, "至少还有一个非默认玩法入口（否则「显式 id 优先」无判别力）");
  assert.equal(resolveLaunchGameplayId(` ${other} `), other, "显式 id 优先且被 trim");

  // ③ 无硬编码闸（③ 是 ① 抓不到的那格：默认入口恰好等于被写死的那个名字时，值断言
  //    看不出差别；这里直接读两处兜底的源码）。候选字面量集来自生成菜单本身，⛔ 不是手列
  //    的玩法名单——AppRuntime 里的 "idle" 是连接状态字面量，不在候选集内故不会误伤。
  const candidates = [...new Set(GENERATED_MENU_CONTRIBUTIONS
    .map((item) => (item.launch.kind === "gameplay" ? item.launch.gameplayId : null))
    .filter((id): id is string => id !== null))];
  assert.ok(candidates.length >= 2, "候选入口 <2 时本闸判别力不足（菜单被掏空？）");
  for (const relative of ["apps/client/src/app/AppRuntime.ts", "apps/client/src/Main.ts"]) {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    assert.match(source, /DEFAULT_LAUNCH_GAMEPLAY_ID|resolveLaunchGameplayId/u,
      `${relative} 的默认 launch target 必须读生成值（DEFAULT_LAUNCH_GAMEPLAY_ID / resolveLaunchGameplayId）`);
    assert.ok(!/\bGameplayModeId\b/u.test(source),
      `${relative} 不得再引用 GameplayModeId 做默认入口（那是本轮消灭的硬编码）`);
    for (const id of candidates) {
      assert.ok(!source.includes(`"${id}"`) && !source.includes(`'${id}'`),
        `${relative} 出现玩法 id 字面量 ${JSON.stringify(id)}：默认入口必须来自菜单数据`);
    }
  }
});

test("contribution 归属：拥有自己 feature 的玩法，菜单入口必须由该 feature 贡献（⛔ 不得留在 builtin）", () => {
  // §3.2 第 8 条的例外已关闭（features/snake/ 落地）：玩法只要有自己的 features/<id>/，
  // 它的 Home 入口就必须写在自己的 manifest 里，⛔ 不得再回写 built-in 的中央菜单表。
  // 反之，尚无独立 feature 的玩法（ballMove：保留为可选入口与内部回归样例）不受此约束。
  const featureIds = new Set(FEATURE_IDS);
  const gameplayItems = GENERATED_MENU_CONTRIBUTIONS
    .map((item) => (item.launch.kind === "gameplay" ? { item, gameplayId: item.launch.gameplayId } : null))
    .filter((entry): entry is { item: GeneratedMenuContribution; gameplayId: string } => entry !== null);
  const misplaced = gameplayItems
    .filter(({ item, gameplayId }) => featureIds.has(gameplayId) && item.featureId !== gameplayId)
    .map(({ item, gameplayId }) => `${item.featureId}/${item.entryId} → ${gameplayId}`);
  assert.deepEqual(misplaced, [],
    "玩法自持 feature 时其 contribution 必须由自己贡献（把入口搬回 features/built-in 即红）");
  // 自洽闭合：本仓当前确实存在这样一个玩法（否则上面的过滤恒空，断言退化为永真）。
  const selfOwned = gameplayItems.filter(({ gameplayId }) => featureIds.has(gameplayId));
  assert.ok(selfOwned.length >= 1, "至少一个玩法拥有自己的 feature（否则本断言无判别力）");
});

test("菜单排序：多 contribution fixture 按 featureId → entryId；首屏顺序只听宿主 placement；引用不存在的入口 fail-fast", () => {
  const fixture = (featureId: string, entryId: string): GeneratedMenuContribution => ({
    entryId, featureId, label: entryId, labelKey: `menu.${entryId}`,
    launch: { kind: "gameplay", gameplayId: `${entryId}Game` },
  });
  const descriptors = [
    {
      id: "zeta", resident: false, dependencies: [], routes: [],
      menu: [fixture("zeta", "zA"), fixture("zeta", "zB")],
    },
    {
      id: "alpha", resident: false, dependencies: [], routes: [],
      menu: [fixture("alpha", "aC"), fixture("alpha", "aD"), fixture("alpha", "aA")],
    },
  ];
  const host = {
    defaultLaunch: { kind: "gameplay" as const, gameplayId: "zBGame" },
    home: [{ featureId: "zeta", entryId: "zB" }, { featureId: "alpha", entryId: "aD" }],
  };
  const registry = new FeatureRegistry(descriptors, host);
  assert.deepEqual(
    registry.menuContributions().map((item) => `${item.featureId}/${item.entryId}`),
    ["alpha/aA", "alpha/aC", "alpha/aD", "zeta/zA", "zeta/zB"],
    "全量列表：featureId 先行，entryId 兜底（⛔ 无 slot/order）",
  );
  assert.deepEqual(
    registry.homeContributions().map((item) => `${item.featureId}/${item.entryId}`),
    ["zeta/zB", "alpha/aD"],
    "首屏顺序 = 宿主 placement 逐字（与字母序无关）",
  );
  assert.equal(registry.defaultLaunchGameplayId(), "zBGame");
  assert.throws(
    () => new FeatureRegistry(descriptors, { ...host, home: [{ featureId: "alpha", entryId: "zB" }] }).homeContributions(),
    /宿主 placement 引用不存在的入口: alpha\/zB/u,
    "placement 的 featureId/entryId 必须与某条 contribution 精确一致",
  );
  assert.throws(
    () => new FeatureRegistry([descriptors[0], { ...descriptors[1], menu: [fixture("alpha", "zA")] }], { ...host, home: [] }),
    /重复 menu entryId: zA/u,
    "entryId 全仓唯一（跨 feature 撞名即 fail-fast）",
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
    entryId: "fxEntry", featureId: "fx", label: "夹具玩法", labelKey: "menu.fx",
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
  const seen: FeatureLaunchTarget[] = [];
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
