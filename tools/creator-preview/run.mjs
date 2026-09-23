#!/usr/bin/env node
/**
 * Creator 预览证据生成器：在真实引擎桌面预览里重放「登录 → 首屏 → 设置 → 插件入口」并落盘截图 + report.json。
 *
 *   node tools/creator-preview/run.mjs <home|settings|redeem|tally|all> [--out <dir>] [--code <兑换码>]
 *   node tools/creator-preview/run.mjs stage3d --perf --quality low|medium|high --expect-webgl 1|2
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
import { replayMapOriginalWorld } from "./maporiginal.mjs";
import { replaySgzzmapWorld } from "./sgzzmap.mjs";
import { replaySlgMap } from "./slg.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCENARIOS = ["areaList", "loginNotice", "home", "settings", "redeem", "tally", "cosmetic", "snake", "ballMove", "arena", "arenaCapture", "arenaDuel", "arenaShop", "slg", "sgzzmap", "mapOriginal", "mmoWorld", "mmohold", "all"];
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

  overlayDismissals = [];

  async walk() {
    // ⚠ 顺手关掉错误浮层：它一弹出来就把后续点击全吃掉，而错误可能在**任何**一步冒出来，
    //   只在 tap() 里关是不够的（登录页 Spine 报错就是点完才弹）。⛔ 不掩盖错误：console 照记。
    await this.dismissErrorOverlay();
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
    await this.dismissErrorOverlay();
    await this.client.click(node.center.x, node.center.y);
    return { tapped: note ?? node.path, at: [Math.round(node.center.x), Math.round(node.center.y)] };
  }

  /**
   * 关掉预览页的 DOM 错误浮层（`#error`）。
   *
   * ⚠ 它是**盖在画布之上的 DOM**，会把 CDP 的鼠标事件整个吃掉 —— 一旦页面报过错，
   * 后续所有点击都点不动（实测：登录页 Spine 骨骼版本不匹配 ⇒ 之后一步都走不下去）。
   * ⛔ 这**不是**在掩盖错误：console 里的 error/uncaught 仍由 consoleHook 全量记进 report.json，
   * 浮层出现过这件事也记在 `overlayDismissals` 里。
   */
  async dismissErrorOverlay() {
    const hit = await this.client.evaluate(`(() => {
      const out = [];
      const hide = (el, text) => { el.style.setProperty("display", "none", "important"); out.push(text); };
      // ① Creator 自带的 #error 面板
      const panel = document.getElementById("error");
      // 注意：面板是 position:fixed —— offsetParent 按规范恒为 null，
      // 拿它判可见会永远判成不可见然后直接跳过（踩过一次）。只能用 getComputedStyle。
      if (panel && getComputedStyle(panel).display !== "none") {
        hide(panel, (panel.innerText || "").trim().slice(0, 900));
      }
      // ② 应用自己的错误浮层：无 id、position:fixed、z-index 顶到 2^31，盖住整张画布。
      //    这才是真正吃掉点击的那个（#error 只是 Creator 的，另一个）。
      //    只对**文本里带「出错 / Error」**的下手，⛔ 不要见 fixed 就藏。
      const canvas = document.querySelector("canvas");
      const cr = canvas ? canvas.getBoundingClientRect() : null;
      if (cr) {
        for (const el of document.querySelectorAll("div")) {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" || cs.display === "none") continue;
          if (Number(cs.zIndex) < 2000000000) continue;
          const b = el.getBoundingClientRect();
          if (b.width < cr.width * 0.5 || b.height < cr.height * 0.5) continue;
          const text = (el.innerText || "").trim();
          if (!/出错|Error/u.test(text)) continue;
          hide(el, text.slice(0, 900));
        }
      }
      return out.length > 0 ? out.join(" | ") : null;
    })()`).catch(() => null);
    if (hit) this.overlayDismissals.push(hit);
    return hit;
  }

  /** 点文本节点；`near` 给定时在多个同名候选里挑与锚点同一行的那个（分组页的多枚「进入」）。 */
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

  /** 设置页按稳定 entryId 定位整卡；先滚入裁剪视口，再重读真实坐标点击。 */
  async tapSettingsEntry(entryId) {
    const scroll = await this.client.evaluate(`(${revealSettingsEntry.toString()})(${JSON.stringify(entryId)})`);
    if (!scroll.ok) throw new Error(`无法定位设置入口 ${entryId}：${scroll.error}`);
    // ScrollView 的零时长滚动也需等下一帧更新世界变换；不复用滚动前的 walk。
    if (scroll.scrolled) await sleep(100);
    await this.walk();
    const target = this.find({ name: `card-${entryId}`, pathIncludes: "SettingsView/panel/viewport/content/" })[0];
    const viewport = this.find({ name: "viewport", pathIncludes: "SettingsView/panel/" })[0];
    if (!target || !viewport) throw new Error(`滚动后找不到设置入口 ${entryId} 或其视口`);
    const scaleY = this.lastWalk.canvas.height / this.lastWalk.visible.height;
    const halfHeight = viewport.center.height * scaleY / 2;
    if (target.center.y <= viewport.center.y - halfHeight || target.center.y >= viewport.center.y + halfHeight) {
      throw new Error(`设置入口 ${entryId} 的点击中心仍在裁剪视口外`);
    }
    return { entryId, scroll, ...(await this.tap(target, `card-${entryId}`)) };
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

/** 页面侧仅操作 ScrollView；入口激活始终由随后真实鼠标点击触发。函数须保持自包含。 */
function revealSettingsEntry(entryId) {
  if (typeof cc === "undefined" || !cc.director?.getScene()) return { ok: false, error: "场景尚未就绪" };
  const find = (node) => {
    if (!node.activeInHierarchy) return null;
    if (node.name === "SettingsView") return node;
    for (const child of node.children) { const found = find(child); if (found) return found; }
    return null;
  };
  const settings = find(cc.director.getScene());
  const viewport = settings?.getChildByName("panel")?.getChildByName("viewport");
  const scroll = viewport?.getComponent("cc.ScrollView");
  const card = scroll?.content?.getChildByName(`card-${entryId}`);
  const cardTransform = card?.getComponent("cc.UITransform");
  const viewportTransform = viewport?.getComponent("cc.UITransform");
  if (!scroll || !card?.activeInHierarchy || !cardTransform || !viewportTransform) {
    return { ok: false, error: "卡片或 ScrollView 不存在（可能正停在通用设置详情）" };
  }
  scroll.stopAutoScroll();
  const before = scroll.getScrollOffset().y;
  const height = viewportTransform.height;
  // content 为顶锚，卡片是其直接子节点；y 负值表示距内容顶部的距离。
  const top = -card.position.y - cardTransform.height * (1 - cardTransform.anchorY);
  const bottom = top + cardTransform.height;
  const max = Math.max(0, scroll.getMaxScrollOffset().y);
  const outside = top < before || bottom > before + height;
  const offset = outside ? Math.max(0, Math.min(max, (top + bottom - height) / 2)) : before;
  if (outside) scroll.scrollToOffset(new cc.Vec2(0, offset), 0);
  return { ok: true, scrolled: outside, before, offset, max };
}

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
  if (!runner.hasNode("SettingsView")) {
    await runner.step("点首屏「设置」", () => runner.tapText("设置", { pathIncludes: "PromoHomeView" }));
  } else if (!runner.hasNode("EntryGroupView")) {
    const back = runner.find({ name: "btn-back", pathIncludes: "SettingsView/" })[0];
    if (back) await runner.step("通用设置返回入口卡片", () => runner.tap(back, "btn-back"));
  }
  return runner.step("设置面板：上方系统设置、下方玩法入口", async () => {
    await runner.waitFor("SettingsView", (walk) => (selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null));
    const sections = runner.find({ pathIncludes: "SettingsView/", kind: "label", textMatches: /^(系统设置|玩法入口)$/u }).map((node) => node.text);
    if (sections.length !== 2) throw new Error(`设置面板缺少系统/玩法分区：${JSON.stringify(sections)}`);
    const entries = runner.find({ namePrefix: "card-", pathIncludes: "SettingsView/panel/viewport/content/", kind: "node" })
      .map((card) => ({
        entryId: card.name.slice("card-".length),
        label: runner.find({ pathIncludes: `${card.path}/`, kind: "label" })[0]?.text ?? "",
      }));
    if (entries.length === 0 || entries.some((entry) => !entry.label)) throw new Error("设置面板缺少玩法卡片或卡片标题");
    const shot = await runner.shot("settings");
    return { sections, entries, shot };
  });
}

async function scenarioRedeem(runner) {
  await scenarioSettings(runner);
  const code = runner.options.code;
  await runner.step("点「兑换码」卡片", () => runner.tapSettingsEntry("redeem"));
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
  await runner.step("点「点数赛」卡片", () => runner.tapSettingsEntry("tally"));
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
 * EntryGroupView 的成员行锚点：行文本是 `${label}  ·  ${unitId}`。
 * ⛔ 不能只按 unitId 消歧——kit 的多个 menu 入口共用同一个包 id（arena 的 竞技场 / 占领赛 / 决斗）。
 */
const entryRow = (label, unitId) => new RegExp(`^${label}\\s+·\\s+${unitId}$`, "u");

/** 从设置面板按 entryId 点整张玩法卡片。 */
async function enterFromSettings(runner, label, entryId, note) {
  await scenarioSettings(runner);
  return runner.step(`点「${label}」卡片${note ? `（${note}）` : ""}`, () => runner.tapSettingsEntry(entryId));
}

/**
 * 经**入口分组页**进一条成员入口（arena 四个入口收在「竞技场」卡片后面）：
 * 设置面板 →「竞技场」整卡 → EntryGroupView →成员行的「进入」。
 */
async function enterFromGroup(runner, groupId, groupLabel, label, unitId, note) {
  await scenarioSettings(runner);
  await runner.walk();
  // 上一个场景可能把分组页留在栈顶（gameplay 形态的入口不走 closeBackToSettings）：已经在分组页上
  // 就直接点成员，⛔ 不要再点一次设置卡片（卡片此刻被分组页盖着）。
  if (!runner.hasNode("EntryGroupView")) {
    await runner.step(`设置面板点「${groupLabel}」卡片进入分组页`, async () => {
      await runner.tapSettingsEntry(groupId);
      await runner.waitFor("EntryGroupView", (walk) => (selectNodes(walk, { name: "EntryGroupView" }).length > 0 ? true : null), 30_000);
      const rows = runner.find({ pathIncludes: "EntryGroupView", kind: "label", textMatches: /\s+·\s+/u }).map((node) => node.text);
      return { rows };
    });
  }
  return runner.step(`分组页里进「${label} · ${unitId}」${note ? `（${note}）` : ""}`,
    () => runner.tapText("进入", { near: entryRow(label, unitId), pathIncludes: "EntryGroupView/" }));
}

/**
 * route 形态页面点「关闭」后回到设置面板。
 * ⚠ 如果这条入口是从**分组页**进的，关掉它露出来的是分组页——要再关一层才回到设置面板。
 */
async function closeBackToSettings(runner, viewName) {
  return runner.step(`「关闭」回到设置面板（${viewName} 卸载）`, async () => {
    await runner.tapText("关闭", { pathIncludes: viewName });
    await runner.waitFor(
      `${viewName} 关闭`,
      (walk) => (selectNodes(walk, { name: viewName }).length === 0 ? true : null),
    );
    let viaGroup = false;
    await runner.walk();
    if (runner.hasNode("EntryGroupView")) {
      viaGroup = true;
      await runner.tapText("关闭", { pathIncludes: "EntryGroupView" });
      await runner.waitFor("EntryGroupView 关闭",
        (walk) => (selectNodes(walk, { name: "EntryGroupView" }).length === 0 ? true : null));
    }
    await runner.waitFor("SettingsView 仍在",
      (walk) => (selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null));
    return { settingsStillOpen: true, viaGroup };
  });
}

/** gameplay 形态的通用重放：连点动作按钮直到「你赢了！」，再等结算回首屏。 */
async function playUntilWin(runner, { actionText, countLabel, shotPrefix, maxTaps, returnsTo = "home" }) {
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
  if (returnsTo === "group") {
    // 从分组页进的战斗，打完必须回到**那一组**，⛔ 不是大厅（否则玩家每打一局就被扔回首屏，
    // 还得再点设置 → 竞技场才能玩下一个）。设置面板同时被还原，所以关掉分组页仍露出设置面板。
    return runner.step("结算后回到分组页（⛔ 不是大厅）", async () => {
      await runner.waitFor(
        "EntryGroupView 回来且结算文案消失",
        (walk) => (selectNodes(walk, { name: "EntryGroupView" }).length > 0
          && selectNodes(walk, { name: "SettingsView" }).length > 0
          && selectNodes(walk, { textMatches: /你赢了/u }).length === 0 ? true : null),
        45_000,
      );
      const rows = runner.find({ pathIncludes: "EntryGroupView", kind: "label", textMatches: /\s+·\s+/u }).map((node) => node.text);
      const shot = await runner.shot(`${shotPrefix}-back-group`);
      return { rows, settingsBelow: true, shot };
    });
  }
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

/**
 * 衣柜（2026-09-06 起并入 snake）：设置面板**没有**「衣柜」条目了，唯一入口是打完一局后结算页的
 * 「我的衣柜」。所以本场景先跑一局 snake 到结算页，再从那儿进衣柜。
 */
async function scenarioCosmetic(runner) {
  await snakeRunToResult(runner);
  await runner.step("结算页点「我的衣柜」（衣柜的唯一入口）", async () => {
    await runner.tapText("我的衣柜", { pathIncludes: "SnakeWorld.RunResult" });
    return { shot: await runner.shot("cosmetic-from-result") };
  });
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
  await runner.step("「关闭」回到结算页（WardrobeView 卸载，结算页还在）", async () => {
    await runner.tapText("关闭", { pathIncludes: "WardrobeView" });
    await runner.waitFor(
      "WardrobeView 关闭且结算页仍在",
      (walk) => (selectNodes(walk, { name: "WardrobeView" }).length === 0
        && selectNodes(walk, { kind: "label", text: "返回主页" }).length > 0 ? true : null),
    );
    return { resultStillOpen: true, shot: await runner.shot("cosmetic-back-to-result") };
  });
  return snakeBackHome(runner, "cosmetic");
}

/** kit 的 route 形态入口：棋盘页 + 占一格（走 arena.capture → withKitTx → k_arena_board → effect 奖杯）。 */
async function scenarioArena(runner) {
  await enterFromGroup(runner, "arenaHub", "竞技场", "竞技场", "arena", "kit route 形态：kit 的客户端 entry 由 PluginHost 装载");
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
  await enterFromGroup(runner, "arenaHub", "竞技场", "占领赛", "arena", "kit gameplay 形态：加入 GameRoom");
  const start = await runner.step("ArenaCaptureView 挂载并开局", async () => {
    await runner.waitFor("「占领赛 · arenaCapture」标题", (walk) => selectNodes(walk, { kind: "label", text: "占领赛 · arenaCapture" })[0] ?? null, 60_000);
    const status = await runner.waitFor("「目标 N 格」状态行", (walk) => selectNodes(walk, { kind: "label", textMatches: /目标\s*\d+\s*格/u })[0] ?? null, 60_000);
    const goal = Number(status.text.match(/目标\s*(\d+)\s*格/u)[1]);
    const shot = await runner.shot("arenaCapture-start");
    return { status: status.text, goal, shot };
  });
  return playUntilWin(runner, { actionText: "占领", countLabel: "你已占", shotPrefix: "arenaCapture", maxTaps: start.goal + 3, returnsTo: "group" });
}

/** kit 的第二个 gameplay 形态 mode。 */
async function scenarioArenaDuel(runner) {
  await enterFromGroup(runner, "arenaHub", "竞技场", "决斗", "arena", "kit gameplay 形态：加入 GameRoom");
  const start = await runner.step("ArenaDuelView 挂载并开局", async () => {
    await runner.waitFor("「决斗 · arenaDuel」标题", (walk) => selectNodes(walk, { kind: "label", text: "决斗 · arenaDuel" })[0] ?? null, 60_000);
    const status = await runner.waitFor("「HP N」状态行", (walk) => selectNodes(walk, { kind: "label", textMatches: /HP\s*\d+/u })[0] ?? null, 60_000);
    const hp = Number(status.text.match(/HP\s*(\d+)/u)[1]);
    const shot = await runner.shot("arenaDuel-start");
    return { status: status.text, hp, shot };
  });
  return playUntilWin(runner, { actionText: "出击", countLabel: "你已命中", shotPrefix: "arenaDuel", maxTaps: start.hp + 3, returnsTo: "group" });
}

/** 建在 kit 上的插件：读 kit 的 board 面拿自己的格，买加固走 kit 的 boostTile → tx.debit 扣金币。 */
async function scenarioArenaShop(runner) {
  await enterFromGroup(runner, "arenaHub", "竞技场", "竞技场商店", "arenaShop", "plugin route 形态：requires.kits.arena.board");
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
    await enterFromGroup(runner, "arenaHub", "竞技场", "竞技场商店", "arenaShop", "占领后重开");
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
/** 打一局 snake 直到结算页（snake 与 cosmetic 两个场景共用；cosmetic 要经结算页才够得着衣柜）。 */
async function snakeRunToResult(runner) {
  await runner.walk();
  if (runner.find({ pathIncludes: "SnakeWorld.RunResult", kind: "label", text: "返回主页" })[0]) return;
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
    // 2026-09-06 修复前：确认框首击会被服务端静默丢弃（点下去框关了、局没结束）。客户端已加看门狗
    // （1.5 s 内没进终局就用当前 runId 重发一次，仍无效才把确认框还回来），这里保留兜底重试只为暴露回归。
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
}

/** 结算页「返回主页」回首屏。 */
async function snakeBackHome(runner, shotPrefix = "snake") {
  return runner.step("「返回主页」回首屏", async () => {
    await runner.tapText("返回主页");
    await runner.waitFor("PromoHomeView 回来", (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 ? true : null), 45_000);
    const shot = await runner.shot(`${shotPrefix}-back-home`);
    return { shot };
  });
}

/** snake 全流程：跑一局 → 结算页（顺带钉住「我的衣柜」与「返回主页」同排）→ 回首屏。 */
async function scenarioSnake(runner) {
  await snakeRunToResult(runner);
  await runner.step("结算页两颗按钮同排（「返回主页」+「我的衣柜」）", async () => {
    await runner.walk();
    const exit = runner.find({ pathIncludes: "SnakeWorld.RunResult", kind: "label", text: "返回主页" })[0];
    const wardrobe = runner.find({ pathIncludes: "SnakeWorld.RunResult", kind: "label", text: "我的衣柜" })[0];
    if (!wardrobe) throw new Error("结算页没有「我的衣柜」——衣柜并入 snake 后这是它唯一的入口");
    const dy = Math.abs(exit.center.y - wardrobe.center.y);
    if (dy > 4) throw new Error(`两颗按钮不在同一行（Δy=${dy}）`);
    return {
      exitAt: [Math.round(exit.center.x), Math.round(exit.center.y)],
      wardrobeAt: [Math.round(wardrobe.center.x), Math.round(wardrobe.center.y)],
      sameRow: true, deltaY: dy,
    };
  });
  return snakeBackHome(runner, "snake");
}

/** 宿主自有的 ballMove 演示入口（builtin 的 menu 条目）：入口能进 + 房间加入 + 视图挂载 + 「离开」回首屏。 */
async function scenarioBallMove(runner) {
  await enterFromSettings(runner, "进入战斗", "ballMove", "宿主自有 plugin 的 gameplay 入口（ballMove 演示）");
  await runner.step("BallMoveView 挂载（加入 GameRoom）", async () => {
    await runner.waitFor(
      "BallMoveView 的 PlayersLayer",
      (walk) => (selectNodes(walk, { name: "PlayersLayer" }).length > 0 ? true : null),
      90_000,
    );
    const exit = runner.find({ name: "BallMove.Exit" })[0] ?? null;
    // 单人进这个演示时 roster 不满（要 2 人），必须有「等待另一名玩家（n/2）」这行字——
    // 否则玩家只看到「点了没反应」（客户端已不再把 move 发出去，见 F17）。
    const waiting = runner.find({ pathIncludes: "BallMove.Waiting", kind: "label" })[0] ?? null;
    if (!waiting || !/等待另一名玩家（\d+\/\d+）/u.test(waiting.text ?? "")) {
      throw new Error(`未开局时应显示等待提示，实际：${JSON.stringify(waiting && waiting.text)}`);
    }
    const shot = await runner.shot("ballmove");
    return { shot, hasExitButton: exit !== null, waiting: waiting.text, note: "画布演示无文本，判据是 PlayersLayer 挂载 + 「离开」按钮 + 等待提示" };
  });
  // ⚠ 必须真的**动一下**：这个演示的输入是「点画布 → 朝那儿走」，而 c2s.move 只在 phase=Playing
  // 允许（ballMove roster 要 2 人才开局）。以前这个场景只挂载、只点「离开」，从不发输入，
  // 于是「单人时一动就被服务端 1001 拒」这条一直测不到。⛔ 别把这一步删了。
  await runner.step("在画布上拖一下（发 c2s.move）→ 控制台 ⛔ 不许出现服务端错误", async () => {
    const canvas = await runner.client.evaluate(`(() => {
      const rect = document.querySelector("#GameCanvas").getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    const before = (await runner.client.evaluate("(window.__creatorPreviewLogs || []).length")) ?? 0;
    await runner.client.click(canvas.x + 40, canvas.y - 60);
    await sleep(600);
    await runner.client.click(canvas.x - 50, canvas.y + 70);
    await sleep(900);
    const logs = await runner.client.evaluate("(window.__creatorPreviewLogs || []).slice(-20)");
    const fresh = logs.slice(Math.max(0, logs.length - (logs.length - Math.max(0, before - (logs.length - logs.length)))));
    const serverErrors = logs.filter((entry) => entry.text && entry.text.includes("[服务端错误]"));
    if (serverErrors.length > 0) throw new Error(`拖动后服务端回了错误：${serverErrors.map((e) => e.text).join(" | ").slice(0, 300)}`);
    return { taps: 2, logsBefore: before, logsAfter: logs.length, note: "单人时 phase 还是 Waiting，⛔ 客户端不该把 move 发出去" };
  });

  return runner.step("点「离开」回首屏（2026-09-06 修复前该入口没有退出 UI）", async () => {
    await runner.tapText("离开");
    await runner.waitFor(
      "PromoHomeView 回来且演示已卸载",
      (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 && selectNodes(walk, { name: "PlayersLayer" }).length === 0 ? true : null),
      45_000,
    );
    const shot = await runner.shot("ballmove-back-home");
    return { shot };
  });
}

/**
 * 按住拖动再松手（CDP 鼠标：按下 → 8 段移动到目标点 → 原地按住 holdMs（每 150 ms 补一次同点 move，节点级 TOUCH_MOVE 才会持续到达）→ 松开）。
 * `poll(walk)` 给定时按住期间每 ~600 ms 重读一次场景，返回真值即提前松手并把它返回。
 */
async function dragHold(runner, from, to, holdMs, poll = null) {
  const send = (params) => runner.client.send("Input.dispatchMouseEvent", params);
  await send({ type: "mouseMoved", x: from.x, y: from.y });
  await send({ type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    await send({ type: "mouseMoved", x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8, button: "left", buttons: 1 });
    await sleep(40);
  }
  let found = null;
  const deadline = Date.now() + holdMs;
  let nextPoll = Date.now() + 600;
  while (Date.now() < deadline && !found) {
    await send({ type: "mouseMoved", x: to.x, y: to.y, button: "left", buttons: 1 });
    await sleep(150);
    if (poll && Date.now() >= nextPoll) {
      found = poll(await runner.walk());
      nextPoll = Date.now() + 600;
    }
  }
  await send({ type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
  return found;
}

/** 世界层里非本人的实体方块（名字 = 实体 id；排除地面 / 环 / 文本 / 本人 char:）。 */
const otherEntityPlates = (walk) => selectNodes(walk, { pathIncludes: "MmoWorldLayer/world/", kind: "node" })
  .filter((node) => !["world", "ground", "label", "self-ring", "target-ring", "plate"].includes(node.name) && !node.name.startsWith("char:"));

/** 摇杆朝 dir 按住直到 poll 命中或超时（探索：出生点旁没有别的实体时朝各方向走，视野 400 单位）。 */
async function joystickHold(runner, dir, holdMs, poll) {
  await runner.walk();
  const pad = runner.find({ name: "joystick", pathIncludes: "MmoWorldLayer/hud/" })[0];
  if (!pad) throw new Error("找不到摇杆");
  const scale = runner.lastWalk.canvas.width / runner.lastWalk.visible.width;
  const reach = pad.center.width * scale * 0.45;
  const from = { x: pad.center.x, y: pad.center.y };
  // 屏幕 y 向下为正（CDP 页面坐标）；世界 +y 也向下 ⇒ dir 直接用
  const to = { x: from.x + dir.x * reach, y: from.y + dir.y * reach };
  return dragHold(runner, from, to, holdMs, poll);
}

const distance = (a, b) => Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);

/**
 * MG1-B1 竖屏操作模型证据（mmo kit 默认 HUD）：设置面板「进入世界」整卡（`card-enter`，kit 的 route 形态）→ 选角页（没有角色先「建角」）
 * →「进入」→ `MmoWorldLayer`（状态条 HP、摇杆 / 轮盘 / 停 / 拾取 / 传送 / 离开）→ 摇杆按住向右拖 1.2 s 松手 ⇒ 地面相对左移（本人向 +x 走）+ 旋钮回中
 * → 轻点一个非本人实体方块 ⇒ 状态条「目标 <名>」+ 红环 → 点轮盘第一槽 ⇒ 施法反馈（提示 / 冷却秒数）→「离开」回首屏。
 * 前置：本地栈 `npm run dev`（mmo kit 已装；有 mmodemo 时首图 demoVale 出生点旁就有行商）。
 */
async function scenarioMmoWorld(runner) {
  await enterFromSettings(runner, "进入世界", "enter", "mmo kit 的 route 形态入口（选角页）");
  await runner.step("选角页挂载（「选择角色」+ 槽位行）", async () => {
    await runner.waitFor("「选择角色」", (walk) => selectNodes(walk, { kind: "label", text: "选择角色" })[0] ?? null, 30_000);
    await runner.waitFor("槽位行（进入 / 建角）", (walk) => selectNodes(walk, { kind: "label", textMatches: /^(进入|建角)$/u })[0] ?? null, 30_000);
    const rows = runner.find({ pathIncludes: "MmoCharacterSelectView", kind: "label" }).map((node) => node.text).filter(Boolean);
    const shot = await runner.shot("mmo-characters");
    return { rows: rows.slice(0, 12), shot };
  });
  await runner.step("没有角色先「建角」（fighter / dawn 默认名）；点第一枚「进入」", async () => {
    await runner.walk();
    let created = false;
    if (runner.find({ kind: "label", text: "进入" }).length === 0) {
      const create = runner.find({ kind: "label", text: "建角" })[0];
      if (!create) throw new Error("选角页既无「进入」也无「建角」");
      await runner.tap(create, "建角");
      await runner.waitFor("建角后出现「进入」", (walk) => selectNodes(walk, { kind: "label", text: "进入" })[0] ?? null, 30_000);
      created = true;
    }
    const enter = runner.find({ kind: "label", text: "进入" })[0];
    return { created, ...(await runner.tap(enter, "进入")) };
  });
  const world = await runner.step("世界 HUD 挂载（MmoWorldLayer：状态条 HP、摇杆 joystick/knob、轮盘 wheel、停 / 拾取 / 传送 / 离开）", async () => {
    const statusOf = (walk) => selectNodes(walk, { pathIncludes: "MmoWorldLayer/hud/status", kind: "label", textMatches: /HP \d+\/\d+/u })[0] ?? null;
    await runner.waitFor("MmoWorldLayer 状态条 HP", statusOf, 90_000);
    await runner.waitFor("视野同步完成 + 本人实体（char: 方块）", (walk) => {
      const status = statusOf(walk);
      const self = selectNodes(walk, { pathIncludes: "MmoWorldLayer/world/", namePrefix: "char:" })[0];
      return status && !status.text.includes("同步中") && self ? true : null;
    }, 60_000);
    const required = ["joystick", "knob", "wheel", "btn-停", "btn-拾取", "btn-传送", "btn-离开"];
    const missing = required.filter((name) => !runner.hasNode(name));
    if (missing.length > 0) throw new Error(`HUD 缺少节点：${missing.join(", ")}`);
    const spells = runner.find({ pathIncludes: "MmoWorldLayer/hud/wheel/slots/", kind: "label" }).map((node) => node.text).filter((text) => text && !/^\d+s$/u.test(text));
    if (spells.length === 0) throw new Error("轮盘没有技能槽（职业技能表为空？）");
    const status = runner.find({ pathIncludes: "MmoWorldLayer/hud/status", kind: "label" }).map((node) => node.text);
    const ground = runner.find({ name: "ground", pathIncludes: "MmoWorldLayer/world/" })[0];
    if (!ground) throw new Error("世界层没有地面");
    const shot = await runner.shot("mmo-world");
    return { status, spells, groundAt: [ground.center.x, ground.center.y], shot };
  });
  await runner.step("摇杆：按住向右拖到 90% 半径、按住 1.2 s 松手 ⇒ 地面相对左移（本人向 +x 走）且旋钮回中", async () => {
    await runner.walk();
    const pad = runner.find({ name: "joystick", pathIncludes: "MmoWorldLayer/hud/" })[0];
    if (!pad) throw new Error("找不到摇杆");
    const scaleX = runner.lastWalk.canvas.width / runner.lastWalk.visible.width;
    const from = { x: pad.center.x, y: pad.center.y };
    const to = { x: pad.center.x + pad.center.width * scaleX * 0.45, y: pad.center.y };
    await dragHold(runner, from, to, 1_200);
    await sleep(500);
    await runner.walk();
    const ground = runner.find({ name: "ground", pathIncludes: "MmoWorldLayer/world/" })[0];
    const knob = runner.find({ name: "knob", pathIncludes: "MmoWorldLayer/hud/joystick/" })[0];
    const shift = ground.center.x - world.groundAt[0];
    const knobBack = Math.abs(knob.center.x - pad.center.x) < 2 && Math.abs(knob.center.y - pad.center.y) < 2;
    const shot = await runner.shot("mmo-joystick");
    if (!(shift < -4)) throw new Error(`拖摇杆后地面未相对左移（Δx=${shift.toFixed(1)} px）——本人没有向 +x 移动`);
    if (!knobBack) throw new Error("松手后旋钮未回中");
    return { groundShiftX: Math.round(shift * 10) / 10, knobBack, shot };
  });
  await runner.step("视野里没有别的实体就摇杆探索（下 → 右 → 上 → 左，各 ≤ 14 s；demoVale 出生点到野猪田约 8 s）", async () => {
    await runner.walk();
    if (otherEntityPlates(runner.lastWalk).length > 0) return { explored: false, visible: otherEntityPlates(runner.lastWalk).map((node) => node.name) };
    const tried = [];
    for (const [name, dir] of [["down", { x: 0, y: 1 }], ["right", { x: 1, y: 0 }], ["up", { x: 0, y: -1 }], ["left", { x: -1, y: 0 }]]) {
      const startedAt = Date.now();
      const found = await joystickHold(runner, dir, 14_000, (walk) => (otherEntityPlates(walk).length > 0 ? otherEntityPlates(walk).map((node) => node.name) : null));
      tried.push({ dir: name, ms: Date.now() - startedAt, found: found ?? null });
      if (found) {
        await sleep(400);
        return { explored: true, tried, visible: found, shot: await runner.shot("mmo-explore") };
      }
    }
    throw new Error(`四个方向各走 14 s 仍没遇到别的实体：${JSON.stringify(tried)}`);
  });
  await runner.step("轻点一个非本人实体方块（优先行商）⇒ 状态条「目标 <名>」+ target-ring", async () => {
    await runner.walk();
    const labels = runner.find({ pathIncludes: "MmoWorldLayer/world/", kind: "label" });
    const plates = otherEntityPlates(runner.lastWalk);
    if (plates.length === 0) throw new Error("视野里没有非本人实体");
    const plate = plates.find((node) => labels.some((label) => label.text.startsWith("行商") && distance(label, node) < 60)) ?? plates[0];
    const label = labels.slice().sort((a, b) => distance(a, plate) - distance(b, plate))[0];
    const name = (label?.text ?? "").split(" ")[0];
    await runner.tap(plate, `实体方块 ${plate.name}`);
    await runner.waitFor(`状态条「目标 ${name}」`, (walk) => selectNodes(walk, { pathIncludes: "MmoWorldLayer/hud/status", kind: "label", textIncludes: `目标 ${name}` })[0] ?? null, 15_000);
    const targetRing = runner.hasNode("target-ring");
    const shot = await runner.shot("mmo-target");
    if (!targetRing) throw new Error("选中后没有 target-ring");
    return { entity: plate.name, name, targetRing, shot };
  });
  await runner.step("轮盘：点第一枚技能槽 ⇒ cast 发出（状态条施法 / 冷却提示或槽上冷却秒数）", async () => {
    await runner.walk();
    const spell = world.spells[0];
    const slot = runner.find({ pathIncludes: "MmoWorldLayer/hud/wheel/slots/", kind: "label", text: spell })[0];
    if (!slot) throw new Error(`轮盘找不到技能槽 ${spell}`);
    await runner.tap(slot, `轮盘槽 ${spell}`);
    const feedback = await runner.waitFor("施法反馈", (walk) => {
      const status = selectNodes(walk, { pathIncludes: "MmoWorldLayer/hud/status", kind: "label" }).map((node) => node.text).find((text) => text && /施法|冷却|未发出|：/u.test(text));
      if (status) return { via: "status", text: status };
      const cooldown = selectNodes(walk, { pathIncludes: "MmoWorldLayer/hud/wheel/slots/", kind: "label", textMatches: /^\d+s$/u })[0];
      return cooldown ? { via: "wheel-cooldown", text: cooldown.text } : null;
    }, 15_000);
    const shot = await runner.shot("mmo-cast");
    return { spell, feedback, shot };
  });
  return runner.step("点「离开」回首屏（MmoWorldLayer 卸载）", async () => {
    await runner.tapText("离开", { pathIncludes: "MmoWorldLayer/hud/" });
    await runner.waitFor("PromoHomeView 回来且世界已卸载",
      (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 && selectNodes(walk, { name: "MmoWorldLayer" }).length === 0 ? true : null), 45_000);
    const shot = await runner.shot("mmo-back-home");
    return { shot };
  });
}

/** MG2：只解析公开 HUD Label，⛔ 不读 Logic、网络端口或脚本状态缓存。 */
function readHoldHud(walk) {
  const label = (name) => selectNodes(walk, { name, kind: "label", pathIncludes: "MmoHoldHudView/" })[0]?.text ?? "";
  const dawn = /^曙光\s+(\d+)\s*\/\s*100$/u.exec(label("hold-dawn-score"));
  const dusk = /^暮光\s+(\d+)\s*\/\s*100$/u.exec(label("hold-dusk-score"));
  const owners = /^A 据点 · (曙光|暮光|中立)\s+B 据点 · (曙光|暮光|中立)$/u.exec(label("hold-owners"));
  const phase = label("hold-phase");
  return {
    ready: !!dawn && !!dusk && !!owners,
    dawn: dawn ? Number(dawn[1]) : null,
    dusk: dusk ? Number(dusk[1]) : null,
    pointA: owners?.[1] ?? null,
    pointB: owners?.[2] ?? null,
    phase,
    round: Number(/第 (\d+) 轮/u.exec(phase)?.[1]) || null,
    status: label("hold-status"),
  };
}

/** 只读可见名片 HP 与横坐标。用公开地面宽度 + 内容包区域中心还原 world x，区分两点各两名活守卫。 */
function readHoldGuards(walk) {
  const pack = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "apps/plugins/mmohold/content/pack.json"), "utf8"));
  const map = pack.maps.find((entry) => entry.mapId === "holdRidge");
  const regions = pack.regions.filter((entry) => entry.mapId === map?.mapId && ["pointA", "pointB"].includes(entry.regionId));
  const ground = selectNodes(walk, { name: "ground", pathIncludes: "MmoWorldLayer/world/", kind: "node" })[0];
  const pixelWidth = ground?.center.width * walk.canvas.width / walk.visible.width;
  if (!map || regions.length !== 2 || !ground || !(pixelWidth > 0)) return null;
  const alive = [], dead = [], unmatched = [];
  const counts = { pointA: 0, pointB: 0 };
  for (const label of selectNodes(walk, { kind: "label", pathIncludes: "MmoWorldLayer/world/", textMatches: /^据点守卫 \d+\/\d+$/u })) {
    const hp = Number(/^据点守卫 (\d+)\//u.exec(label.text)[1]);
    const x = map.size.w * 0.5 + (label.center.x - ground.center.x) * map.size.w / pixelWidth;
    const region = regions.find((entry) => entry.shape.kind === "circle" && Math.abs(entry.shape.center.x - x) <= entry.shape.radius);
    const guard = { text: label.text, hp, worldX: Math.round(x), point: region?.regionId ?? null };
    if (hp <= 0) { dead.push(guard); continue; }
    alive.push(guard);
    if (region) counts[region.regionId] += 1;
    else unmatched.push(guard);
  }
  return { alive, dead, counts, unmatched, exact: alive.length === 4 && counts.pointA === 2 && counts.pointB === 2 && unmatched.length === 0 };
}

async function waitHoldHud(runner, timeoutMs = 90_000) {
  return runner.waitFor("MmoHoldHudView 已收到服务器据点快照与本人实体", (walk) => {
    const state = readHoldHud(walk);
    const self = selectNodes(walk, { pathIncludes: "MmoWorldLayer/world/", namePrefix: "char:" })[0];
    return state.ready && self && /HP \d+\/\d+/u.test(state.status) ? state : null;
  }, timeoutMs);
}

async function enterHoldCharacter(runner, preferredName = null) {
  await runner.waitFor("据点比分页角色入口", (walk) => selectNodes(walk, { name: "MmoHoldStandingsView" })[0] ?? null, 30_000);
  await runner.waitFor("角色列表或建角按钮", (walk) => selectNodes(walk, { pathIncludes: "MmoHoldStandingsView/", namePrefix: "btn-enter-" })[0]
    ?? selectNodes(walk, { name: "btn-create-dawn", pathIncludes: "MmoHoldStandingsView/" })[0] ?? null, 30_000);
  let buttons = runner.find({ pathIncludes: "MmoHoldStandingsView/", namePrefix: "btn-enter-" });
  let created = false;
  if (!buttons.length) {
    await runner.tap(runner.find({ name: "btn-create-dawn", pathIncludes: "MmoHoldStandingsView/" })[0], "建曙光角色");
    await runner.waitFor("建角后的进入按钮", (walk) => selectNodes(walk, { pathIncludes: "MmoHoldStandingsView/", namePrefix: "btn-enter-" })[0] ?? null, 30_000);
    buttons = runner.find({ pathIncludes: "MmoHoldStandingsView/", namePrefix: "btn-enter-" });
    created = true;
  }
  const labels = runner.find({ pathIncludes: "MmoHoldStandingsView/", kind: "label", textMatches: / · (曙光|暮光)$/u });
  const enabled = buttons.filter((button) => runner.find({ pathIncludes: `${button.path}/`, kind: "label", text: "进入" }).length > 0);
  const button = preferredName ? enabled.find((entry) => entry.name === preferredName) : enabled[0];
  if (!button) throw new Error(preferredName ? `原角色 ${preferredName} 不再可进入` : "没有可进入的 active 角色");
  const label = nearestByRow(labels, button);
  const factionLabel = / · (曙光|暮光)$/u.exec(label?.text ?? "")?.[1];
  if (!factionLabel) throw new Error("角色行未显示可识别的阵营");
  const result = { created, button: button.name, character: label.text, faction: factionLabel === "曙光" ? "dawn" : "dusk", factionLabel };
  await runner.tap(button, `进入争夺 ${label.text}`);
  return result;
}

async function leaveHoldWorld(runner) {
  await runner.tapText("离开", { pathIncludes: "MmoHoldHudView/" });
  await runner.waitFor("据点世界卸载并回首屏", (walk) => selectNodes(walk, { name: "PromoHomeView" }).length && !selectNodes(walk, { name: "MmoWorldLayer" }).length ? true : null, 45_000);
}

/** MG2 独立回放：自有域 route → 据点 HUD → 占点 / 得分 → 离座重进即时状态 → 检查点战况。 */
async function scenarioMmoHold(runner) {
  await enterFromSettings(runner, "据点战况", "standings", "mmohold 自有域 + 角色入口");
  const entry = await runner.step("据点战况页：无角色时建曙光角色，选择 active 角色进入争旗山脊", async () => {
    const selected = await enterHoldCharacter(runner);
    return { ...selected, shot: await runner.shot("mmohold-enter") };
  });
  await runner.step("自有 HUD：比分 / 据点归属 / 操作按钮与本人实体到位", async () => {
    const state = await waitHoldHud(runner);
    const required = ["MmoHoldHudView", "hold-scoreboard", "hold-owners", "hold-dawn-score", "hold-dusk-score", "hold-joystick", "hold-wheel", "btn-前往 A", "btn-前往 B", "btn-离开"];
    const missing = required.filter((name) => !runner.hasNode(name));
    if (missing.length) throw new Error(`据点 HUD 缺少 ${missing.join(", ")}`);
    return { state, shot: await runner.shot("mmohold-world") };
  });
  await runner.step("点「前往 A」：A 归本阵营后实时比分增长", async () => {
    await runner.tapText("前往 A", { pathIncludes: "MmoHoldHudView/" });
    const owned = await runner.waitFor("A 据点已归本阵营且本轮仍在计分", (walk) => {
      const state = readHoldHud(walk);
      return state.ready && state.pointA === entry.factionLabel && state.round !== null && state[entry.faction] < 99 ? state : null;
    }, 100_000);
    const advanced = await runner.waitFor("同一轮次内实时阵营比分增长", (walk) => {
      const state = readHoldHud(walk);
      return state.ready && state.round === owned.round && state[entry.faction] > owned[entry.faction] ? state : null;
    }, 15_000);
    return { before: owned, after: advanced, shot: await runner.shot("mmohold-score-growth") };
  });
  const captured = await runner.step("点「前往 B」：B 归本阵营，活守卫总数严格为 4、A/B 各 2", async () => {
    await runner.tapText("前往 B", { pathIncludes: "MmoHoldHudView/" });
    const evidence = await runner.waitFor("B 归属与两据点各两名活守卫", (walk) => {
      const state = readHoldHud(walk);
      const guards = readHoldGuards(walk);
      if (guards && guards.alive.length > 4) throw new Error(`活守卫重复：${JSON.stringify(guards)}`);
      return state.ready && state.pointB === entry.factionLabel && guards?.exact ? { state, guards } : null;
    }, 100_000);
    return { ...evidence, shot: await runner.shot("mmohold-point-b") };
  });
  await runner.step("离开争旗山脊，卸载自有 HUD", async () => {
    await leaveHoldWorld(runner);
    return { shot: await runner.shot("mmohold-left") };
  });
  await enterFromSettings(runner, "据点战况", "standings", "重进原角色");
  await runner.step("同角色重新进入：本人实体出现时已有当前比分快照", async () => {
    const selected = await enterHoldCharacter(runner, entry.button);
    await runner.waitFor("重进后的本人实体", (walk) => selectNodes(walk, { pathIncludes: "MmoWorldLayer/world/", namePrefix: "char:" })[0] ?? null, 90_000);
    const started = Date.now();
    const state = await waitHoldHud(runner, 1_500);
    const elapsedAfterSelfMs = Date.now() - started;
    const guards = await runner.waitFor("重进后活守卫仍为 4、A/B 各 2", (walk) => {
      const result = readHoldGuards(walk);
      if (result && result.alive.length > 4) throw new Error(`重进后活守卫重复：${JSON.stringify(result)}`);
      return result?.exact ? result : null;
    }, 10_000);
    return { selected, elapsedAfterSelfMs, priorState: captured.state, state, guards, shot: await runner.shot("mmohold-reentered") };
  });
  await runner.step("重进验证后离开争旗山脊", async () => {
    await leaveHoldWorld(runner);
    return { shot: await runner.shot("mmohold-left-again") };
  });
  await enterFromSettings(runner, "据点战况", "standings", "刷新当前轮次检查点");
  await runner.step("自有域刷新当前轮次检查点比分", async () => {
    await runner.waitFor("据点比分页", (walk) => selectNodes(walk, { name: "MmoHoldStandingsView" })[0] ?? null, 30_000);
    let rows = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      await runner.tapText("刷新", { pathIncludes: "MmoHoldStandingsView/" });
      await sleep(1_000);
      await runner.walk();
      const error = runner.find({ pathIncludes: "MmoHoldStandingsView/", kind: "label", textMatches: /^读取失败/u })[0];
      if (error) throw new Error(`比分查询失败：${error.text}`);
      // 行色板与文字为同级节点，按公开行文本辨认；⛔ 不假设文字挂在色板下面。
      rows = runner.find({ pathIncludes: "MmoHoldStandingsView/hold-standings/", kind: "label" }).map((node) => node.text)
        .filter((text) => /^分线 \d+ ·|^\d+ : \d+$|^A (曙光|暮光|中立) · B (曙光|暮光|中立) ·/u.test(text));
      if (rows.some((text) => /检查点 [1-9]\d* · tick [1-9]\d*/u.test(text))) break;
      await sleep(3_000);
    }
    if (!rows.some((text) => /检查点 [1-9]\d* · tick [1-9]\d*/u.test(text))) throw new Error("刷新后仍无已持久化的分线检查点战况");
    const texts = runner.find({ pathIncludes: "MmoHoldStandingsView/", kind: "label" }).map((node) => node.text);
    const shot = await runner.shot("mmohold-checkpoint-standings");
    await runner.tapText("关闭", { pathIncludes: "MmoHoldStandingsView/" });
    return { rows, texts, shot, note: "检查点比分按周期刷新；不把当前 HUD 比分与旧检查点强行比较" };
  });
}

// ---------- 入口 ----------

async function main() {
  if (process.argv[2] === "stage3d") {
    if (process.argv.includes("--perf")) {
      const { parseStage3dPerfArgs, runStage3dPerf } = await import("./perf.mjs");
      const options = parseStage3dPerfArgs(process.argv.slice(3));
      if (options.help) { console.log("stage3d --perf: --quality low|medium|high --expect-webgl 1|2 [--force-webgl1] [--preview <loopback>] [--new-window] [--out <dir>]"); return 0; }
      const result = await runStage3dPerf(options);
      console.log(JSON.stringify({ ok: result.report.ok, report: result.reportPath, summary: result.summaryPath, error: result.report.error ?? null }));
      return result.report.ok ? 0 : 1;
    }
    const { parseStage3dProbeArgs, runStage3dProbe } = await import("./probe-stage3d.mjs");
    const options = parseStage3dProbeArgs(process.argv.slice(3));
    if (options.help) { console.log("stage3d: --preview <loopback> --expect-webgl 1|2 [--force-webgl1] --out <dir> [--summary <file>]"); return 0; }
    const result = await runStage3dProbe({ ...options, preview: process.argv.includes("--preview") ? options.preview : "http://localhost:7456" });
    return result.report.exitCode;
  }
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
      // ⚠ 钩子必须在**任何页面脚本之前**装：早先是在 openScene 之后才 evaluate，于是开机期
      // （引擎启动、资源加载）的 console 记录全漏了——snake 的 5 条 `texture missing` 就是这么
      // 一直没被报告看见的。⛔ 不要把这一步挪回 openScene 之后。
      await client.send("Page.enable");
      await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource });
      await runner.step("加载预览场景（Fetch 改写 settings.js?scene=）", async () => {
        const boot = await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs });
        return { frames: boot.frames, canvas: boot.canvas, visible: boot.visible, topLevel: boot.nodes.filter((node) => node.depth === 1).map((node) => node.name) };
      });
    }
    // --reuse 的页面已经加载过，补装一次（钩子自身幂等）。
    await client.evaluate(consoleHookSource);
    const scenarios = options.scenario === "all" ? ALL_SEQUENCE : [options.scenario];
    const table = {
      home: scenarioHome, settings: scenarioSettings, redeem: scenarioRedeem, tally: scenarioTally,
      slg: async (current) => { await scenarioSettings(current); await replaySlgMap(current); },
      // ⚠ sgzzmap 与 slg 的卡片标签都是「大地图」，入口按 entryId 定位（world / map），⛔ 不按文本
      sgzzmap: async (current) => { await scenarioSettings(current); await replaySgzzmapWorld(current); },
      // ⚠ mapOriginal 的卡片标签是「原版大地图」，entryId=originalWorld；它**无服务端**，
      //    所以重放里 ⛔ 没有占领/行军这类写操作
      mapOriginal: async (current) => { await scenarioSettings(current); await replayMapOriginalWorld(current); },
      cosmetic: scenarioCosmetic, arena: scenarioArena, arenaCapture: scenarioArenaCapture,
      arenaDuel: scenarioArenaDuel, arenaShop: scenarioArenaShop, mmoWorld: scenarioMmoWorld, mmohold: scenarioMmoHold,
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
        // ⚠ warn 也要进报告：`[snake] texture missing …` 这类是 console.warn，早先被过滤掉，
        // 于是报告写着「console 零 error」而控制台里其实是一屏黄字。⛔ 不要再按等级丢记录。
        report.console = await client.evaluate("window.__creatorPreviewLogs || []");
      } catch {}
      client.close();
    }
    report.steps = runner ? runner.steps : [];
    // ⚠ 浮层出现过就如实记：它是「页面报过错」的旁证，⛔ 不因为被关掉就当没发生
    report.overlayDismissals = runner ? runner.overlayDismissals : [];
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  for (const step of report.steps) console.log(`${step.ok ? "✔" : "✘"} ${step.name}${step.skipped ? "（跳过）" : ""}${step.error ? ` — ${step.error}` : ""}${step.screenshots.length ? `  [${step.screenshots.join(", ")}]` : ""}`);
  if ((report.overlayDismissals ?? []).length > 0) {
    console.log(`⚠ 关掉了 ${report.overlayDismissals.length} 次页面错误浮层（会吞掉点击；原因见 report.json 的 overlayDismissals）`);
  }
  if (report.console.length > 0) {
    const bad = report.console.filter((entry) => entry.level !== "warn").length;
    console.log(`⚠ 页面 console 有 ${report.console.length} 条记录（其中 error/uncaught ${bad} 条；见 report.json）`);
  }
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
