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
const SCENARIOS = ["home", "settings", "redeem", "tally", "all"];
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
      .map((text) => ({ label: text.replace(/\s*·\s*\S+$/u, ""), featureId: text.match(/·\s*(\S+)$/u)[1] }));
    if (entries.length === 0) throw new Error("设置面板没有任何插件入口行");
    const shot = await runner.shot("settings");
    return { entries, shot };
  });
}

async function scenarioRedeem(runner) {
  await scenarioSettings(runner);
  const code = runner.options.code;
  await runner.step("进入「兑换码 · redeem」", () => runner.tapText("进入", { near: /·\s*redeem$/u }));
  await runner.step("RedeemView 挂载（route 形态：FeatureHost 动态装载后打开）", async () => {
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
  const goal = await runner.step("TallyView 挂载并开局（gameplay 形态：FeatureHost 装载 → 加入 GameRoom）", async () => {
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
    const scenarios = options.scenario === "all" ? ["home", "settings", "redeem", "tally"] : [options.scenario];
    const table = { home: scenarioHome, settings: scenarioSettings, redeem: scenarioRedeem, tally: scenarioTally };
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
