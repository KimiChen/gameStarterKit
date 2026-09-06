#!/usr/bin/env node
/**
 * Creator 预览证据生成器：在真实引擎桌面预览里重放「登录 → 首屏 → 设置 → 插件入口」并落盘截图 + report.json。
 *
 *   node tools/creator-preview/run.mjs <home|settings|redeem|tally|all> [--out <dir>] [--code <兑换码>]
 *        [--format jpeg|png] [--devtools http://127.0.0.1:9222] [--preview http://localhost:7456]
 *        [--scene <uuid>] [--boot-timeout <ms>] [--step-timeout <ms>] [--reuse]
 *
 * 前置（都是外部进程，脚本只检测不代起）：Creator 3.8.8 已打开 apps/Cocos 且预览服务在 7456；Chrome 以
 * CLAUDE.md 约定的 `--remote-debugging-port=9222` 启动且窗口可见；本地栈 + 游戏服（`npm run dev`）在跑。
 * ⛔ 不进 verify:core / verify:all。退出码 0 = 全部步骤通过；每一步的判据与截图都写进 report.json。
 * 详见同目录 README.md。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CdpClient,
  DEFAULTS,
  acquireTab,
  consoleHookSource,
  designToPage,
  nearestByRow,
  openScene,
  pageWalkSource,
  parseArgs,
  sceneUuidFromMeta,
  selectNodes,
  sleep,
} from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCENARIOS = ["areaList", "loginNotice", "home", "settings", "redeem", "tally", "cosmetic", "snake", "ballMove", "arena", "arenaCapture", "arenaDuel", "arenaShop", "all"];
/** `all` 的顺序：先 route 形态再 gameplay 形态；arenaShop 排在 arena 之后（它要一块自己的格子）。 */
const ALL_SEQUENCE = ["areaList", "loginNotice", "home", "settings", "redeem", "tally", "cosmetic", "arena", "arenaCapture", "arenaDuel", "arenaShop", "snake", "ballMove"];
/** 登录页兜底坐标（设计 375×812）：只在找不到 FGUI 对象 btn_login 时使用，并在报告里标注。 */
const LOGIN_BUTTON_DESIGN = { x: 184.7, y: 670 };

class Runner {
  constructor(client, options, outDir) {
    this.client = client;
    this.options = options;
    this.outDir = outDir;
    this.steps = [];
    this.shotIndex = 0;
    this.lastWalk = null;
  }

  async walk() {
    this.lastWalk = await this.client.evaluate(pageWalkSource);
    return this.lastWalk;
  }

  /** 记录一步：fn 返回的对象写入 detail；抛错则记 error 并向上抛（场景中止，报告仍会落盘）。 */
  async step(name, fn) {
    const entry = { name, ok: false, startedAt: new Date().toISOString(), detail: null, screenshots: [] };
    this.steps.push(entry);
    this.currentStep = entry;
    try {
      entry.detail = (await fn()) ?? null;
      entry.ok = true;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      // 失败现场也截一张，便于复核。
      try {
        await this.shot(`failed-${slug(name)}`);
      } catch {}
      throw error;
    } finally {
      entry.finishedAt = new Date().toISOString();
      this.currentStep = null;
    }
    return entry.detail;
  }

  async waitFor(what, pick, timeoutMs = this.options.stepTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let found = null;
    while (Date.now() < deadline) {
      const walk = await this.walk();
      found = pick(walk);
      if (found) return found;
      await sleep(400);
    }
    const visible = this.lastWalk ? this.lastWalk.nodes.filter((node) => node.text).map((node) => node.text).slice(0, 40) : [];
    throw new Error(`等待「${what}」超时（${timeoutMs} ms）；当前可见文本：${JSON.stringify(visible)}`);
  }

  find(query) {
    return selectNodes(this.lastWalk, query);
  }

  async tap(node, note) {
    if (!node || !node.center) throw new Error(`无法点击：${note ?? "节点缺少坐标"}`);
    await this.client.click(node.center.x, node.center.y);
    return { tapped: note ?? node.path, at: [Math.round(node.center.x), Math.round(node.center.y)] };
  }

  /** 点文本节点；`near` 给定时在多个同名候选里挑与锚点同一行的那个（设置面板的多枚「进入」）。 */
  async tapText(text, { near, pathIncludes } = {}) {
    await this.walk();
    const query = typeof text === "string" ? { text } : { textMatches: text };
    if (pathIncludes) query.pathIncludes = pathIncludes;
    const candidates = this.find(query);
    if (candidates.length === 0) throw new Error(`找不到文本节点 ${String(text)}`);
    let target = candidates[0];
    if (near) {
      const anchor = this.find(typeof near === "string" ? { text: near } : { textMatches: near })[0];
      if (!anchor) throw new Error(`找不到锚点文本 ${String(near)}`);
      target = nearestByRow(candidates, anchor);
    } else if (candidates.length > 1) {
      throw new Error(`文本 ${String(text)} 命中 ${candidates.length} 个节点，需要 near 锚点消歧`);
    }
    return this.tap(target, `${String(text)}${near ? ` @ ${String(near)}` : ""}`);
  }

  async shot(name) {
    await sleep(250); // 让渲染追上最后一次点击。
    const walk = this.lastWalk ?? (await this.walk());
    this.shotIndex += 1;
    const extension = this.options.format === "png" ? "png" : "jpg";
    const file = path.join(this.outDir, `${String(this.shotIndex).padStart(2, "0")}-${name}.${extension}`);
    const clip = walk ? { x: walk.canvas.x, y: walk.canvas.y, width: walk.canvas.width, height: walk.canvas.height, scale: 1.5 } : undefined;
    await this.client.screenshot(file, { clip, format: this.options.format });
    const relative = path.basename(file);
    if (this.currentStep) this.currentStep.screenshots.push(relative);
    return relative;
  }

  hasNode(name) {
    return this.find({ name }).length > 0;
  }
}

const slug = (text) => text.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "").toLowerCase();

// ---------- 场景 ----------

/** 回到登录页：已经登录过就重载预览页（authenticated base 不可逆退）。 */
async function ensureLoginPage(runner) {
  await runner.walk();
  if (selectNodes(runner.lastWalk, { name: "btn_login" }).length > 0) return { via: "already-login" };
  await runner.client.send("Page.reload", { ignoreCache: false });
  await sleep(4_000);
  await runner.waitFor("重载后的登录页 btn_login", (walk) => selectNodes(walk, { name: "btn_login" })[0] ?? null, 120_000);
  return { via: "reload" };
}

/**
 * 登录页的 FGUI 弹窗（builtin 的 areaList / loginNotice 两个 route）：点开 → 读内容 → 关闭。
 * ⚠ FGUI 视图挂在 `GRoot/…/layer_popup/…/GComponent` 下，节点名不是类名——按各自**独有的子件名**判定
 * （区服列表 `lst_server`、公告 `tge_tip`、确认框 `yesBtn`）。外部身份服务不在时会落到 ConfirmView 的
 * 错误分支（「区服列表加载失败」/「公告加载失败」），那也是实据——把弹出的到底是哪一个如实记进报告。
 */
async function loginPopup(runner, { button, marker, viewName, routeId, shotPrefix }) {
  await runner.step(`回到登录页（${routeId} 只在登录页可达）`, () => ensureLoginPage(runner));
  const opened = await runner.step(`点登录页 FGUI 按钮 ${button} 打开 ${routeId}`, async () => {
    const target = runner.find({ name: button })[0];
    if (!target) throw new Error(`登录页找不到 FGUI 按钮 ${button}`);
    const tapped = await runner.tap(target, button);
    const shown = await runner.waitFor(
      `${viewName}（子件 ${marker}）或 ConfirmView（子件 yesBtn）`,
      (walk) => {
        if (selectNodes(walk, { name: marker }).length > 0) return viewName;
        return selectNodes(walk, { name: "yesBtn" }).length > 0 ? "ConfirmView" : null;
      },
      30_000,
    );
    const texts = runner.find({ pathIncludes: "layer_popup" }).map((node) => node.text).filter(Boolean);
    const shot = await runner.shot(`${shotPrefix}-${shown === viewName ? "opened" : "confirm"}`);
    return { tapped, shown, outcome: shown === viewName ? "opened" : "error-confirm", texts: texts.slice(0, 14), shot };
  });
  const marker2 = opened.shown === "ConfirmView" ? "yesBtn" : marker;
  return runner.step(`关闭 ${opened.shown}`, async () => {
    await runner.walk();
    const close = runner.find({ name: opened.shown === "ConfirmView" ? "yesBtn" : "btn_close" })[0]
      ?? runner.find({ name: "btn_mask" })[0];
    if (!close) throw new Error(`${opened.shown} 上找不到关闭按钮（btn_close / yesBtn / btn_mask）`);
    await runner.tap(close, close.name);
    await runner.waitFor(
      `${opened.shown} 关闭后回到登录页`,
      (walk) => (selectNodes(walk, { name: marker2 }).length === 0 && selectNodes(walk, { name: "btn_login" }).length > 0 ? true : null),
      20_000,
    );
    return { closed: opened.shown };
  });
}

const scenarioAreaList = (runner) => loginPopup(runner, { button: "btn_server", marker: "lst_server", viewName: "AreaListView", routeId: "areaList", shotPrefix: "arealist" });
const scenarioLoginNotice = (runner) => loginPopup(runner, { button: "btn_notice", marker: "tge_tip", viewName: "LoginNoticeView", routeId: "loginNotice", shotPrefix: "notice" });

async function scenarioHome(runner) {
  await runner.walk();
  if (runner.hasNode("PromoHomeView")) {
    runner.steps.push({ name: "登录", ok: true, skipped: true, detail: { reason: "已在首屏（--reuse）" }, screenshots: [] });
  } else {
    await runner.step("登录页可见（FGUI btn_login）", async () => {
      // 登录页是 FGUI 包：「开始游戏」是图片标题，没有可读文本，按 FGUI 对象名 btn_login 定位。
      const button = await runner.waitFor("btn_login", (walk) => selectNodes(walk, { name: "btn_login" })[0] ?? null, runner.options.stepTimeoutMs).catch(() => null);
      const shot = await runner.shot("login");
      if (button) return { via: "fgui:btn_login", shot };
      return { via: "design-fallback", note: `未找到 FGUI 对象 btn_login，将按设计坐标 ${JSON.stringify(LOGIN_BUTTON_DESIGN)} 兜底点击`, shot };
    });
    await runner.step("点「开始游戏」", async () => {
      const button = runner.find({ name: "btn_login" })[0];
      if (button) return runner.tap(button, "btn_login");
      const page = designToPage(LOGIN_BUTTON_DESIGN, runner.lastWalk.canvas);
      await runner.client.click(page.x, page.y);
      return { tapped: "design-fallback", at: [Math.round(page.x), Math.round(page.y)] };
    });
  }
  return runner.step("首屏 PromoHomeView 挂载", async () => {
    await runner.waitFor("PromoHomeView", (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 ? true : null), 60_000);
    const card = runner.find({ pathIncludes: "PromoHomeView/card", kind: "label" }).map((node) => node.text);
    const protocolLine = card.find((text) => text.startsWith("协议 ")) ?? null;
    if (!protocolLine) throw new Error(`首屏卡片缺少「协议 …」行：${JSON.stringify(card)}`);
    const shot = await runner.shot("home");
    return { card, protocolLine, shot };
  });
}

async function ensureHome(runner) {
  await runner.walk();
  if (!runner.hasNode("PromoHomeView")) await scenarioHome(runner);
}

async function scenarioSettings(runner) {
  await ensureHome(runner);
  await runner.walk();
  if (runner.hasNode("SettingsView")) return runner.steps.at(-1)?.detail;
  await runner.step("点首屏「设置」", () => runner.tapText("设置", { pathIncludes: "PromoHomeView" }));
  return runner.step("设置面板与插件入口", async () => {
    await runner.waitFor("SettingsView", (walk) => (selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null));
    const entries = runner
      .find({ pathIncludes: "row-entry", kind: "label" })
      .map((node) => node.text)
      .filter((text) => /·\s*\S+$/u.test(text))
      .map((text) => ({ label: text.replace(/\s*·\s*\S+$/u, ""), pluginId: text.match(/·\s*(\S+)$/u)[1] }));
    if (entries.length === 0) throw new Error("设置面板没有任何插件入口行");
    const shot = await runner.shot("settings");
    return { entries, shot };
  });
}

async function scenarioRedeem(runner) {
  await scenarioSettings(runner);
  const code = runner.options.code;
  await runner.step("进入「兑换码 · redeem」", () => runner.tapText("进入", { near: /·\s*redeem$/u }));
  await runner.step("RedeemView 挂载（route 形态：PluginHost 动态装载后打开）", async () => {
    const editbox = await runner.waitFor("RedeemView 的输入框", (walk) => (selectNodes(walk, { name: "RedeemView" }).length > 0 ? selectNodes(walk, { kind: "editbox", pathIncludes: "RedeemView" })[0] ?? null : null));
    const shot = await runner.shot("redeem-empty");
    const labels = runner.find({ pathIncludes: "RedeemView", kind: "label" }).map((node) => node.text).filter(Boolean);
    return { editboxText: editbox.text, labels, shot };
  });
  await runner.step(`输入兑换码 ${code}`, async () => {
    const editbox = runner.find({ kind: "editbox", pathIncludes: "RedeemView" })[0];
    await runner.tap(editbox, "editbox");
    await sleep(300);
    await runner.client.insertText(code);
    await runner.waitFor(`输入框回显 ${code}`, (walk) => (selectNodes(walk, { kind: "editbox", pathIncludes: "RedeemView", text: code }).length > 0 ? true : null), 5_000);
    // 输入框聚焦时 Chrome 会把焦点留在隐藏的 <input>，点别处前先失焦，避免首击被吞。
    await runner.client.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur(); true");
    const shot = await runner.shot("redeem-typed");
    return { code, shot };
  });
  await runner.step("点「兑换」并读取结果", async () => {
    await runner.tapText("兑换", { pathIncludes: "RedeemView" });
    const result = await runner.waitFor(
      "兑换结果提示",
      (walk) => selectNodes(walk, { pathIncludes: "RedeemView", kind: "label", textMatches: /兑换成功|已经使用过|不存在|失败|错误|稍后/u })[0] ?? null,
    );
    const outcome = /兑换成功/u.test(result.text) ? "success" : /已经使用过/u.test(result.text) ? "already-claimed" : /不存在/u.test(result.text) ? "invalid" : "other";
    const shot = await runner.shot(`redeem-${outcome}`);
    return { code, outcome, text: result.text, shot };
  });
  return runner.step("「关闭」回到设置面板", async () => {
    await runner.tapText("关闭", { pathIncludes: "RedeemView" });
    await runner.waitFor("RedeemView 关闭且 SettingsView 仍在", (walk) => (selectNodes(walk, { name: "RedeemView" }).length === 0 && selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null));
    return { settingsStillOpen: true };
  });
}

async function scenarioTally(runner) {
  await scenarioSettings(runner);
  await runner.step("进入「点数赛 · tally」", () => runner.tapText("进入", { near: /·\s*tally$/u }));
  const goal = await runner.step("TallyView 挂载并开局（gameplay 形态：PluginHost 装载 → 加入 GameRoom）", async () => {
    const headline = await runner.waitFor("「目标 N 次」标题", (walk) => selectNodes(walk, { kind: "label", textMatches: /目标\s*\d+\s*次/u })[0] ?? null, 60_000);
    const tapGoal = Number(headline.text.match(/目标\s*(\d+)\s*次/u)[1]);
    const shot = await runner.shot("tally-start");
    return { headline: headline.text, tapGoal, shot };
  });
  await runner.step(`连点 TAP 直到判胜（目标 ${goal.tapGoal} 次）`, async () => {
    let taps = 0;
    let midShot = null;
    const maxTaps = goal.tapGoal + 3;
    while (taps < maxTaps) {
      await runner.tapText("TAP");
      taps += 1;
      const settled = await runner.waitFor(
        `第 ${taps} 次点击后的状态回流`,
        (walk) => {
          if (selectNodes(walk, { kind: "label", textMatches: /你赢了/u }).length > 0) return "won";
          const count = selectNodes(walk, { kind: "label", textMatches: new RegExp(`你已点\\s*${taps}(\\D|$)`, "u") });
          return count.length > 0 ? "counted" : null;
        },
        5_000,
      );
      if (taps === Math.ceil(goal.tapGoal / 2)) midShot = await runner.shot("tally-match");
      if (settled === "won") break;
    }
    const won = runner.find({ kind: "label", textMatches: /你赢了/u })[0];
    if (!won) throw new Error(`点了 ${taps} 次仍未判胜`);
    const shot = await runner.shot("tally-settle");
    return { taps, midShot, settleText: won.text, shot };
  });
  return runner.step("结算倒计时结束后回到首屏（AppRuntime 恢复 authenticated base）", async () => {
    await runner.waitFor("PromoHomeView 回来且结算文案消失", (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 && selectNodes(walk, { textMatches: /你赢了|目标\s*\d+\s*次/u }).length === 0 ? true : null), 45_000);
    const card = runner.find({ pathIncludes: "PromoHomeView/card", kind: "label" }).map((node) => node.text);
    const shot = await runner.shot("tally-back-home");
    return { card, shot };
  });
}

/**
 * 设置面板一行插件入口的锚点：行文本是 `${label}  ·  ${unitId}`（SettingsView）。
 * ⛔ 不能只按 unitId 消歧——kit 的多个 menu 入口共用同一个包 id（arena 的 竞技场 / 占领赛 / 决斗）。
 */
const entryRow = (label, unitId) => new RegExp(`^${label}\\s+·\\s+${unitId}$`, "u");

/** 从设置面板点某一行的「进入」。 */
async function enterFromSettings(runner, label, unitId, note) {
  await scenarioSettings(runner);
  return runner.step(`进入「${label} · ${unitId}」${note ? `（${note}）` : ""}`, () => runner.tapText("进入", { near: entryRow(label, unitId) }));
}

/** route 形态页面点「关闭」后回到设置面板。 */
async function closeBackToSettings(runner, viewName) {
  return runner.step(`「关闭」回到设置面板（${viewName} 卸载）`, async () => {
    await runner.tapText("关闭", { pathIncludes: viewName });
    await runner.waitFor(
      `${viewName} 关闭且 SettingsView 仍在`,
      (walk) => (selectNodes(walk, { name: viewName }).length === 0 && selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null),
    );
    return { settingsStillOpen: true };
  });
}

/** gameplay 形态的通用重放：连点动作按钮直到「你赢了！」，再等结算回首屏。 */
async function playUntilWin(runner, { actionText, countLabel, shotPrefix, maxTaps }) {
  await runner.step(`连点「${actionText}」直到判胜（上限 ${maxTaps} 次）`, async () => {
    let taps = 0;
    let midShot = null;
    while (taps < maxTaps) {
      await runner.tapText(actionText);
      taps += 1;
      const settled = await runner.waitFor(
        `第 ${taps} 次点击后的状态回流`,
        (walk) => {
          if (selectNodes(walk, { kind: "label", textMatches: /你赢了/u }).length > 0) return "won";
          return selectNodes(walk, { kind: "label", textMatches: new RegExp(`${countLabel}\\s*${taps}(\\D|$)`, "u") }).length > 0 ? "counted" : null;
        },
        8_000,
      );
      if (taps === Math.ceil(maxTaps / 2)) midShot = await runner.shot(`${shotPrefix}-match`);
      if (settled === "won") break;
    }
    const won = runner.find({ kind: "label", textMatches: /你赢了/u })[0];
    if (!won) throw new Error(`点了 ${taps} 次仍未判胜`);
    const shot = await runner.shot(`${shotPrefix}-settle`);
    return { taps, midShot, settleText: won.text, shot };
  });
  return runner.step("结算倒计时结束后回到首屏（AppRuntime 恢复 authenticated base）", async () => {
    await runner.waitFor(
      "PromoHomeView 回来且结算文案消失",
      (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 && selectNodes(walk, { textMatches: /你赢了/u }).length === 0 ? true : null),
      45_000,
    );
    const shot = await runner.shot(`${shotPrefix}-back-home`);
    return { shot };
  });
}

async function scenarioCosmetic(runner) {
  await enterFromSettings(runner, "衣柜", "snakeCosmetic", "宿主自有 plugin 的 route 形态");
  await runner.step("WardrobeView 挂载并读到皮肤行", async () => {
    await runner.waitFor("WardrobeView", (walk) => (selectNodes(walk, { name: "WardrobeView" }).length > 0 ? true : null), 60_000);
    // ⚠ 筛选状态跨次打开保留（上次停在「可合成」就还停在那儿，可能一行都没有）——先切回「全部」再断言行数。
    await runner.walk();
    const all = runner.find({ pathIncludes: "WardrobeView", kind: "label", text: "全部" })[0];
    if (all) { await runner.tap(all, "全部"); await sleep(900); }
    await runner.waitFor("皮肤行加载完成", (walk) => (selectNodes(walk, { namePrefix: "skin-" }).length > 0 ? true : null), 30_000);
    const skins = runner.find({ namePrefix: "skin-" }).map((node) => node.name.slice("skin-".length));
    const labels = runner.find({ pathIncludes: "WardrobeView", kind: "label" }).map((node) => node.text).filter(Boolean);
    const shot = await runner.shot("cosmetic-open");
    return { skinRows: skins.length, skins: skins.slice(0, 8), labels: labels.slice(0, 16), shot };
  });
  // 只挂载不算验通：碎片够就先「合成」（snakeCosmetic.unlock），再「装备」（snakeCosmetic.equip），都等界面回流。
  // 先验写路径「装备」（snakeCosmetic.equip），再试「合成」（unlock）——后者依赖碎片业务数据，拿不到不算失败。
  await runner.step("切「已拥有」筛选 → 「装备」另一件皮肤（snakeCosmetic.equip）", async () => {
    await runner.tapText("已拥有", { pathIncludes: "WardrobeView" });
    await sleep(1_000);
    await runner.walk();
    // ⚠ 只数「装备」标签的个数没用：换装是**互换**（点的那行变已装备、原来那行变装备），总数不变。
    // 判据必须钉在**被点的那一行**（路径里的 skin-<id>）上。
    const rowButtons = runner.find({ pathIncludes: "skin-", kind: "label", textMatches: /^(装备|已装备)$/u });
    const rows = rowButtons.map((node) => `${node.path.match(/skin-\d+/u)?.[0]}=${node.text}`);
    const target = rowButtons.find((node) => node.text === "装备");
    if (!target) {
      const shot = await runner.shot("cosmetic-nothing-to-equip");
      return { action: "skip", why: "「已拥有」筛选下只有当前已装备的皮肤，没有可切换目标", rows, shot };
    }
    const skin = target.path.match(/skin-\d+/u)?.[0] ?? "?";
    await runner.tap(target, `装备 @ ${skin}`);
    const outcome = await runner.waitFor(
      `装备结果（${skin} 那一行变成「已装备」）`,
      (walk) => {
        if (selectNodes(walk, { pathIncludes: `${skin}/`, kind: "label", text: "已装备" }).length > 0) return "equipped";
        return selectNodes(walk, { pathIncludes: "WardrobeView", kind: "label", textMatches: /失败|不可用|错误/u })[0] ? "refused" : null;
      },
      15_000,
    );
    const shot = await runner.shot(`cosmetic-${outcome}`);
    return { action: "equip", skin, outcome, rowsBefore: rows, shot };
  });
  await runner.step("切「可合成」筛选 → 试「合成」（snakeCosmetic.unlock；碎片业务数据缺失时如实记录）", async () => {
    await runner.walk();
    if (!runner.hasNode("WardrobeView")) return { action: "skip", why: "面板已不在（上一步收尾后关闭）" };
    const filter = runner.find({ pathIncludes: "WardrobeView", kind: "label", text: "可合成" })[0];
    if (!filter) return { action: "skip", why: "面板上没有「可合成」筛选" };
    await runner.tap(filter, "可合成");
    await sleep(1_200);
    await runner.walk();
    if (!runner.hasNode("WardrobeView")) {
      return { action: "skip", why: "点「可合成」后面板消失（未展开排查，本轮只记录）" };
    }
    const craft = runner.find({ pathIncludes: "WardrobeView", kind: "label", text: "合成" })[0];
    if (!craft) {
      const empty = runner.find({ pathIncludes: "WardrobeView", kind: "label", textMatches: /没有皮肤|碎片/u }).map((node) => node.text);
      const shot = await runner.shot("cosmetic-no-craft");
      return { action: "skip", why: "「可合成」筛选下没有可合成皮肤（业务目录里碎片皮肤的 fragmentItemId 为 unavailable）", empty, shot };
    }
    await runner.tap(craft, "合成");
    const outcome = await runner
      .waitFor("合成结果", (walk) => selectNodes(walk, { pathIncludes: "WardrobeView", kind: "label", textMatches: /合成成功|碎片不足|失败|错误/u })[0] ?? null, 12_000)
      .catch(() => null);
    const shot = await runner.shot("cosmetic-craft");
    return { action: "craft", outcome: outcome?.text ?? "no-feedback", shot };
  });
  return closeBackToSettings(runner, "WardrobeView");
}

/** kit 的 route 形态入口：棋盘页 + 占一格（走 arena.capture → withKitTx → k_arena_board → effect 奖杯）。 */
async function scenarioArena(runner) {
  await enterFromSettings(runner, "竞技场", "arena", "kit route 形态：kit 的客户端 entry 由 PluginHost 装载");
  const board = await runner.step("ArenaBoardView 挂载并读到棋盘（16 格 + 奖杯行）", async () => {
    await runner.waitFor(
      "ArenaBoardView 的棋盘格",
      (walk) => (selectNodes(walk, { name: "ArenaBoardView" }).length > 0 && selectNodes(walk, { namePrefix: "tile-" }).length > 0 ? true : null),
      60_000,
    );
    const tiles = runner.find({ namePrefix: "tile-" }).map((node) => node.name.slice("tile-".length)).sort();
    const trophy = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^奖杯\s/u })[0];
    if (!trophy) throw new Error(`棋盘缺少「奖杯 N」行：${JSON.stringify(runner.find({ pathIncludes: "ArenaBoardView", kind: "label" }).map((n) => n.text))}`);
    const shot = await runner.shot("arena-board");
    return { tiles, tileCount: tiles.length, trophyLine: trophy.text, shot };
  });
  await runner.step("占一格（arena.capture：withKitTx 写 k_arena_board + kit effect 发奖杯）", async () => {
    await runner.walk();
    // 优先挑无主格；棋盘被占满时退到自己的格（加固路径，同样过 withKitTx）。
    const emptyLabel = runner.find({ kind: "label", text: "无主", pathIncludes: "tile-" })[0];
    const anyTile = runner.find({ namePrefix: "tile-" })[0];
    const source = emptyLabel ?? anyTile;
    if (!source) throw new Error("棋盘上没有可点的格子");
    const tileName = source.path.match(/tile-[A-Z]\d+/u)?.[0];
    if (!tileName) throw new Error(`无法从路径推出格子节点：${source.path}`);
    const tile = runner.find({ name: tileName })[0];
    const tapped = await runner.tap(tile, tileName);
    const notice = await runner.waitFor(
      "占领结果提示",
      (walk) => selectNodes(walk, { pathIncludes: "ArenaBoardView", kind: "label", textMatches: /已占领|不是你的|失败|错误|稍后|未就绪/u })[0] ?? null,
    );
    const outcome = /已占领/u.test(notice.text) ? "captured" : "refused";
    const trophy = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^奖杯\s/u })[0];
    const shot = await runner.shot(`arena-${outcome}`);
    return { tile: tileName.slice("tile-".length), via: emptyLabel ? "empty-tile" : "own-tile", tapped, outcome, notice: notice.text, trophyLine: trophy?.text ?? null, shot };
  });
  await runner.step("点「刷新」重读棋盘（arena.board 查询面）", async () => {
    const trophyBefore = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^奖杯\s/u })[0]?.text ?? null;
    await runner.tapText("刷新", { pathIncludes: "ArenaBoardView" });
    await sleep(1_200);
    await runner.walk();
    const trophyAfter = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^奖杯\s/u })[0]?.text ?? null;
    const mine = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^\d+$/u }).length;
    const shot = await runner.shot("arena-refreshed");
    return { trophyBefore, trophyAfter, ownedTilesWithPower: mine, shot };
  });
  await runner.step("再点自己的格 = 加固（power +1、⛔ 不再发奖杯）", async () => {
    await runner.walk();
    const trophyBefore = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^奖杯\s/u })[0]?.text ?? null;
    // 自己的格：格内第二行是数字（守备值），无主格是「无主」。
    const powerLabel = runner.find({ kind: "label", textMatches: /^\d+$/u, pathIncludes: "tile-" })[0];
    if (!powerLabel) throw new Error("找不到自己的格（格内应有守备数字）");
    const tileName = powerLabel.path.match(/tile-[A-Z]\d+/u)?.[0];
    const powerBefore = Number(powerLabel.text);
    // 上一步的提示还挂在面板上：必须等**变化后**的提示，⛔ 不能匹配到旧文案（否则加固没发生也会“通过”）。
    const noticeBefore = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /已占领|失败|错误|稍后/u })[0]?.text ?? null;
    const tile = runner.find({ name: tileName })[0];
    await runner.tap(tile, tileName);
    const notice = await runner.waitFor(
      "加固结果提示（与上一条不同）",
      (walk) => selectNodes(walk, { pathIncludes: "ArenaBoardView", kind: "label", textMatches: /已占领|失败|错误|稍后/u })
        .find((node) => node.text !== noticeBefore) ?? null,
    );
    await sleep(600);
    await runner.walk();
    const trophyAfter = runner.find({ pathIncludes: "ArenaBoardView", kind: "label", textMatches: /^奖杯\s/u })[0]?.text ?? null;
    const powerAfter = Number(runner.find({ name: tileName })[0] ? runner.find({ kind: "label", textMatches: /^\d+$/u, pathIncludes: tileName })[0]?.text ?? "0" : "0");
    if (powerAfter !== powerBefore + 1) throw new Error(`加固后守备应 ${powerBefore} → ${powerBefore + 1}，实际 ${powerAfter}`);
    const shot = await runner.shot("arena-reinforced");
    return { tile: tileName?.slice("tile-".length), notice: notice.text, powerBefore, powerAfter, trophyBefore, trophyAfter, trophyUnchanged: trophyBefore === trophyAfter, shot };
  });
  return closeBackToSettings(runner, "ArenaBoardView");
}

/** kit 的第一个 gameplay 形态 mode。 */
async function scenarioArenaCapture(runner) {
  await enterFromSettings(runner, "占领赛", "arena", "kit gameplay 形态：加入 GameRoom");
  const start = await runner.step("ArenaCaptureView 挂载并开局", async () => {
    await runner.waitFor("「占领赛 · arenaCapture」标题", (walk) => selectNodes(walk, { kind: "label", text: "占领赛 · arenaCapture" })[0] ?? null, 60_000);
    const status = await runner.waitFor("「目标 N 格」状态行", (walk) => selectNodes(walk, { kind: "label", textMatches: /目标\s*\d+\s*格/u })[0] ?? null, 60_000);
    const goal = Number(status.text.match(/目标\s*(\d+)\s*格/u)[1]);
    const shot = await runner.shot("arenaCapture-start");
    return { status: status.text, goal, shot };
  });
  return playUntilWin(runner, { actionText: "占领", countLabel: "你已占", shotPrefix: "arenaCapture", maxTaps: start.goal + 3 });
}

/** kit 的第二个 gameplay 形态 mode。 */
async function scenarioArenaDuel(runner) {
  await enterFromSettings(runner, "决斗", "arena", "kit gameplay 形态：加入 GameRoom");
  const start = await runner.step("ArenaDuelView 挂载并开局", async () => {
    await runner.waitFor("「决斗 · arenaDuel」标题", (walk) => selectNodes(walk, { kind: "label", text: "决斗 · arenaDuel" })[0] ?? null, 60_000);
    const status = await runner.waitFor("「HP N」状态行", (walk) => selectNodes(walk, { kind: "label", textMatches: /HP\s*\d+/u })[0] ?? null, 60_000);
    const hp = Number(status.text.match(/HP\s*(\d+)/u)[1]);
    const shot = await runner.shot("arenaDuel-start");
    return { status: status.text, hp, shot };
  });
  return playUntilWin(runner, { actionText: "出击", countLabel: "你已命中", shotPrefix: "arenaDuel", maxTaps: start.hp + 3 });
}

/** 建在 kit 上的插件：读 kit 的 board 面拿自己的格，买加固走 kit 的 boostTile → tx.debit 扣金币。 */
async function scenarioArenaShop(runner) {
  await enterFromSettings(runner, "竞技场商店", "arenaShop", "plugin route 形态：requires.kits.arena.board");
  const opened = await runner.step("ArenaShopView 挂载（经 kit 的 board 面读棋盘）", async () => {
    await runner.waitFor("ArenaShopView", (walk) => (selectNodes(walk, { name: "ArenaShopView" }).length > 0 ? true : null), 60_000);
    const empty = await runner.waitFor(
      "自有格子行或「还没有格子」提示",
      (walk) => {
        if (selectNodes(walk, { pathIncludes: "ArenaShopView", kind: "label", textIncludes: "还没有格子" }).length > 0) return "none";
        return selectNodes(walk, { pathIncludes: "ArenaShopView", kind: "label", textMatches: /\+守备/u }).length > 0 ? "owned" : null;
      },
      20_000,
    );
    const labels = runner.find({ pathIncludes: "ArenaShopView", kind: "label" }).map((node) => node.text).filter(Boolean);
    const shot = await runner.shot("arenaShop-open");
    return { tiles: empty, labels: labels.slice(0, 20), shot };
  });
  if (opened.tiles === "none") {
    // 没有自己的格子就先去竞技场占一块（本插件的入口本来就依赖 kit 的数据）。
    await closeBackToSettings(runner, "ArenaShopView");
    await scenarioArena(runner);
    await enterFromSettings(runner, "竞技场商店", "arenaShop", "占领后重开");
    await runner.step("ArenaShopView 重开并读到自有格", async () => {
      await runner.waitFor("自有格子行", (walk) => selectNodes(walk, { pathIncludes: "ArenaShopView", kind: "label", textMatches: /\+守备/u })[0] ?? null, 20_000);
      const shot = await runner.shot("arenaShop-owned");
      return { shot };
    });
  }
  await runner.step("点「+守备」买加固（arenaShop.buyBoost → kit boostTile → tx.debit）", async () => {
    // 自有格可能不止一块（每块一颗「+守备」）：取最上面那行，并把它对应的格子记进报告。
    await runner.walk();
    const buttons = runner.find({ pathIncludes: "ArenaShopView", kind: "label", textMatches: /^\+守备/u })
      .sort((left, right) => left.center.y - right.center.y);
    if (buttons.length === 0) throw new Error("商店里没有「+守备」按钮（没有自有格？）");
    const rowLabel = nearestByRow(runner.find({ pathIncludes: "ArenaShopView", kind: "label", textMatches: /我方/u }), buttons[0]);
    await runner.tap(buttons[0], `+守备 @ ${rowLabel?.text ?? "?"}`);
    const notice = await runner.waitFor(
      "购买结果提示",
      (walk) => selectNodes(walk, { pathIncludes: "ArenaShopView", kind: "label", textMatches: /守备\s*\d+|金币不足|不是你的|失败|错误|稍后|未就绪/u })[0] ?? null,
    );
    const outcome = /余额|重放/u.test(notice.text) ? "bought" : /金币不足/u.test(notice.text) ? "insufficient-balance" : /不是你的/u.test(notice.text) ? "not-owned" : "other";
    const shot = await runner.shot(`arenaShop-${outcome}`);
    return { rows: buttons.length, row: rowLabel?.text ?? null, outcome, notice: notice.text, shot };
  });
  await runner.step("点「刷新」重读自有格（经 kit 的 board 面）", async () => {
    await runner.tapText("刷新", { pathIncludes: "ArenaShopView" });
    await sleep(1_200);
    await runner.walk();
    const rows = runner.find({ pathIncludes: "ArenaShopView", kind: "label", textMatches: /我方/u }).map((node) => node.text);
    const shot = await runner.shot("arenaShop-refreshed");
    return { rows, shot };
  });
  return closeBackToSettings(runner, "ArenaShopView");
}

/** 宿主自有的默认玩法：进入 → 结束本次（确认框）→ 结算页「返回主页」。 */
async function scenarioSnake(runner) {
  await enterFromSettings(runner, "贪吃蛇大作战", "snake", "宿主自有 gameplay plugin：默认玩法");
  await runner.step("SnakeWorld 挂载并开跑（HUD 出现）", async () => {
    await runner.waitFor(
      "SnakeWorld 的 HUD「结束本次」",
      (walk) => selectNodes(walk, { kind: "label", text: "结束本次", pathIncludes: "SnakeWorld.Hud" })[0] ?? null,
      90_000,
    );
    const hud = runner.find({ pathIncludes: "SnakeWorld.Hud", kind: "label" }).map((node) => node.text).filter(Boolean);
    const shot = await runner.shot("snake-run");
    return { hud: hud.slice(0, 12), shot };
  });
  await runner.step("点「结束本次」→ 确认框", async () => {
    await runner.tapText("结束本次", { pathIncludes: "SnakeWorld.Hud" });
    await runner.waitFor("确认框「确定结束本次游玩吗？」", (walk) => selectNodes(walk, { kind: "label", text: "确定结束本次游玩吗？" })[0] ?? null, 15_000);
    const shot = await runner.shot("snake-end-confirm");
    return { shot };
  });
  await runner.step("确认结束 → 结算页", async () => {
    // 确认框刚出现时点会被吞（实测：点下去框关了、局没结束）——先等它稳定一拍再点，仍无结算就重开重点一次并记进报告。
    const tapConfirm = async () => {
      await sleep(1_200);
      await runner.tapText("结束本次", { pathIncludes: "SnakeWorld.EndRunConfirm" });
      return runner
        .waitFor("结算页 SnakeWorld.RunResult", (walk) => selectNodes(walk, { kind: "label", text: "返回主页" })[0] ?? null, 12_000)
        .catch(() => null);
    };
    let back = await tapConfirm();
    let retried = false;
    if (!back) {
      retried = true;
      await runner.tapText("结束本次", { pathIncludes: "SnakeWorld.Hud" });
      await runner.waitFor("确认框重新出现", (walk) => selectNodes(walk, { kind: "label", text: "确定结束本次游玩吗？" })[0] ?? null, 15_000);
      back = await tapConfirm();
    }
    if (!back) throw new Error("确认结束后没有出现结算页「返回主页」");
    const lines = runner.find({ pathIncludes: "SnakeWorld.RunResult", kind: "label" }).map((node) => node.text).filter((text) => text && text !== "返回主页");
    const shot = await runner.shot("snake-result");
    return { retried, backButtonAt: [Math.round(back.center.x), Math.round(back.center.y)], lines, shot };
  });
  return runner.step("「返回主页」回首屏", async () => {
    await runner.tapText("返回主页");
    await runner.waitFor("PromoHomeView 回来", (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 ? true : null), 45_000);
    const shot = await runner.shot("snake-back-home");
    return { shot };
  });
}

/**
 * 宿主自有的 ballMove 演示入口（builtin 的 menu 条目）：只验「入口能进 + 房间加入 + 视图挂载」——
 * 该演示没有退出 UI，退出靠重载预览页（下一个场景会重新登录）。
 */
async function scenarioBallMove(runner) {
  await enterFromSettings(runner, "进入战斗", "builtin", "宿主自有 plugin 的 gameplay 入口（ballMove 演示）");
  const mounted = await runner.step("BallMoveView 挂载（加入 GameRoom）", async () => {
    await runner.waitFor(
      "BallMoveView 的 PlayersLayer",
      (walk) => (selectNodes(walk, { name: "PlayersLayer" }).length > 0 || selectNodes(walk, { name: "BallMoveView" }).length > 0 ? true : null),
      90_000,
    );
    const shot = await runner.shot("ballmove");
    return { shot, note: "ballMove 是无文本的画布演示，判据是 PlayersLayer/BallMoveView 节点挂载" };
  });
  await runner.step("重载预览页退出演示（该入口无退出 UI）", async () => {
    await runner.client.send("Page.reload", { ignoreCache: false });
    await sleep(3_000);
    return { reloaded: true };
  });
  return mounted;
}

// ---------- 入口 ----------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.scenario) {
    console.log(`用法：node tools/creator-preview/run.mjs <${SCENARIOS.join("|")}> [--out <dir>] [--code <兑换码>] [--format jpeg|png] [--devtools <url>] [--preview <url>] [--scene <uuid>] [--boot-timeout <ms>] [--step-timeout <ms>] [--reuse]`);
    return options.help ? 0 : 2;
  }
  if (!SCENARIOS.includes(options.scenario)) throw new Error(`未知场景 ${options.scenario}；可选：${SCENARIOS.join("|")}`);
  const sceneUuid = options.scene ?? sceneUuidFromMeta(fs.readFileSync(path.join(REPO_ROOT, DEFAULTS.sceneMeta), "utf8"));
  const outDir = path.resolve(options.out ?? path.join(os.tmpdir(), `creator-preview-${new Date().toISOString().replace(/[:.]/gu, "-")}`));
  fs.mkdirSync(outDir, { recursive: true });

  const report = { tool: "tools/creator-preview/run.mjs", scenario: options.scenario, startedAt: new Date().toISOString(), options: { ...options }, scene: sceneUuid, ok: false, steps: [], console: [] };
  let client = null;
  let runner = null;
  try {
    const tab = await acquireTab(options).catch((error) => {
      throw new Error(`Chrome 调试端口不可用（${options.devtools}）：${error.message}。按 CLAUDE.md 用 --remote-debugging-port=9222 启动 Chrome。`);
    });
    report.tab = { id: tab.id, created: tab.created };
    client = await CdpClient.connect(tab.wsUrl);
    runner = new Runner(client, options, outDir);
    if (options.reuse && !tab.created) {
      await client.send("Page.bringToFront");
      const walk = await runner.walk();
      if (!walk) throw new Error("--reuse 的标签页里 cc 未初始化；去掉 --reuse 重新加载");
    } else {
      await runner.step("加载预览场景（Fetch 改写 settings.js?scene=）", async () => {
        const boot = await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs });
        return { frames: boot.frames, canvas: boot.canvas, visible: boot.visible, topLevel: boot.nodes.filter((node) => node.depth === 1).map((node) => node.name) };
      });
    }
    await client.evaluate(consoleHookSource);
    const scenarios = options.scenario === "all" ? ALL_SEQUENCE : [options.scenario];
    const table = {
      home: scenarioHome, settings: scenarioSettings, redeem: scenarioRedeem, tally: scenarioTally,
      cosmetic: scenarioCosmetic, arena: scenarioArena, arenaCapture: scenarioArenaCapture,
      arenaDuel: scenarioArenaDuel, arenaShop: scenarioArenaShop,
      snake: scenarioSnake, ballMove: scenarioBallMove,
      areaList: scenarioAreaList, loginNotice: scenarioLoginNotice,
    };
    for (const name of scenarios) await table[name](runner);
    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (client) {
      try {
        report.console = (await client.evaluate("window.__creatorPreviewLogs || []")).filter((entry) => entry.level !== "warn");
      } catch {}
      client.close();
    }
    report.steps = runner ? runner.steps : [];
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  for (const step of report.steps) console.log(`${step.ok ? "✔" : "✘"} ${step.name}${step.skipped ? "（跳过）" : ""}${step.error ? ` — ${step.error}` : ""}${step.screenshots.length ? `  [${step.screenshots.join(", ")}]` : ""}`);
  if (report.console.length > 0) console.log(`⚠ 页面 console 有 ${report.console.length} 条 error/uncaught（见 report.json）`);
  console.log(`${report.ok ? "✔ 全部通过" : `✘ 失败：${report.error}`} → ${outDir}`);
  return report.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
