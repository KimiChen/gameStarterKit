/**
 * 宣传首屏（docs/PLUGIN.md §6 的框架默认形态）：
 *  - **首屏 ⛔ 不摆玩法入口**——模型字段是封闭集合（多一个入口列表即红），
 *    且 View/Logic 源码不得触达任何菜单/启动通道符号（间接摆上去也红）；
 *  - 首屏唯一动作是右上角设置按钮 → 打开 settings 路由；
 *  - 展示的运行时身份来自 shared 单源常量（⛔ 不复制版本号字面量）；
 *  - 登录后的 authenticated base 就是 promoHome 这条 route（旧 FGUI Home 仍登记可达）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_PLUGINS } from "../src/generated/plugins.generated";
import { GENERATED_VIEW_CATALOG } from "../src/generated/views.generated";
import {
  GAMEPLAY_CATALOG,
  GAME_ROOM_PROTOCOL_VERSION,
  LOBBY_PROTOCOL_VERSION,
  PROJECT_DISPLAY_NAME,
} from "../src/shared/index";
import { PromoHomeLogic } from "../src/logic/page/PromoHomeLogic";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function source(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

/** 去掉注释后的代码面（注释里说「⛔ 不持有 launch 通道」不该把守门测试打红）。 */
function code(relative: string): string {
  return source(relative)
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

test("首屏模型是封闭字段集合：只有宣传内容与设置按钮，⛔ 没有玩法入口列表", () => {
  const logic = new PromoHomeLogic();
  assert.deepEqual(Object.keys(logic.model()).sort(),
    ["runtimeLine", "sessionLine", "settingsLabel", "subtitle", "title"],
    "首屏模型多出任何入口/列表字段即红（玩法入口只在设置面板）");
  assert.equal(logic.model().title, PROJECT_DISPLAY_NAME, "标题取 shared 的项目显示名");
  assert.ok(logic.model().subtitle.length > 0, "副标题必须有一句话介绍");
});

test("首屏 View/Logic 源码 ⛔ 不得触达菜单或启动通道（间接摆玩法入口同样红）", () => {
  // 候选符号 = 「把玩法入口摆上首屏」必然要用到的东西；GAMEPLAY_CATALOG 不在其中
  // （首屏只数已登记玩法个数，不列出它们）。
  const banned = ["menuContributions", "HomeMenuEntryModel", "PluginLaunchTarget", "launch", "enterBattle"];
  for (const relative of [
    "apps/client/src/logic/page/PromoHomeLogic.ts",
    "apps/client/src/view/PromoHomeView.ts",
  ]) {
    const text = code(relative);
    for (const symbol of banned) {
      assert.ok(!text.includes(symbol),
        `${relative} 出现 ${symbol}：首屏 ⛔ 不摆玩法入口（PLUGIN.md §6）`);
    }
  }
});

test("运行时身份行取 shared 单源常量（协议整数 + 已登记玩法数）", () => {
  const line = new PromoHomeLogic().runtimeLine();
  assert.ok(line.includes(String(GAME_ROOM_PROTOCOL_VERSION)), "必须报告 GameRoom 协议身份");
  assert.ok(line.includes(String(LOBBY_PROTOCOL_VERSION)), "必须报告 Lobby 协议身份");
  assert.ok(line.includes(String(Object.keys(GAMEPLAY_CATALOG).length)), "必须报告已登记玩法数");
  // ⛔ 不复制版本号字面量：值只能来自 shared 常量。
  const text = code("apps/client/src/logic/page/PromoHomeLogic.ts");
  for (const symbol of ["GAME_ROOM_PROTOCOL_VERSION", "LOBBY_PROTOCOL_VERSION", "GAMEPLAY_CATALOG"]) {
    assert.ok(text.includes(symbol), `${symbol} 必须来自 shared 单源导入`);
  }
});

test("会话摘要行：无会话给可读占位；有档案时带体力与战绩（对账刷新的消费点）", () => {
  const logic = new PromoHomeLogic();
  assert.equal(logic.sessionLine(), "未登录");
  logic.setSession({ serverName: "区9", userId: "u-1", profile: { stamina: 100, wins: 2, losses: 0 } });
  assert.equal(logic.sessionLine(), "区9 · u-1 · 体力 100 · 2胜0负");
  logic.setSession({ serverName: "", userId: "u-1", profile: null });
  assert.equal(logic.sessionLine(), "u-1", "无服/无档案时不得渲染空片段");
});

test("设置按钮：点击唯一出口是注入的 openSettings 回调", async () => {
  const logic = new PromoHomeLogic();
  let opened = 0;
  logic.onOpenSettings = () => { opened++; };
  await logic.openSettings();
  assert.equal(opened, 1);
});

test("登记：promoHome 是 authenticated base route；旧 FGUI Home 仍是可达 route（⛔ 不删）", () => {
  const builtin = GENERATED_PLUGINS.find((plugin) => plugin.id === "builtin");
  const routes = new Map((builtin?.routes ?? []).map((route) => [route.id, route]));
  assert.equal(routes.get("promoHome")?.view, "PromoHome");
  assert.equal(routes.get("promoHome")?.restore, "reopen", "base 断线恢复必须重开");
  assert.equal(routes.get("settings")?.view, "Settings");
  assert.equal(routes.get("settings")?.restore, "discard", "设置面板不参与断线恢复");
  assert.equal(routes.get("home")?.view, "Home",
    "旧 FGUI Home 保留为可达 route（ballMove 入口 + 开发调试快捷入口）");

  assert.equal(GENERATED_VIEW_CATALOG.PromoHome?.kind, "cocos");
  assert.equal(GENERATED_VIEW_CATALOG.PromoHome?.layer, "base");
  assert.equal(GENERATED_VIEW_CATALOG.PromoHome?.interactive, false,
    "cocos 页面必须 interactive:false，否则 FGUI InputProcessor 全屏吞掉自建节点的触摸");
  assert.equal(GENERATED_VIEW_CATALOG.Settings?.kind, "cocos");
  assert.equal(GENERATED_VIEW_CATALOG.Settings?.layer, "popup");
  assert.equal(GENERATED_VIEW_CATALOG.Settings?.interactive, false);

  // 登录成功后登记的 base 必须是 promoHome（改回 home 即红）。
  const flow = source("apps/client/src/app/loginFlow.ts");
  assert.match(flow, /setAuthenticatedBase\("promoHome"/u,
    "authenticated base 必须登记为 promoHome");
  assert.match(flow, /baseHandle = await openPromoHome\(/u,
    "登录成功的导航目标必须是宣传首屏");
});
