#!/usr/bin/env node
/**
 * P8-③ 原生通道的 Creator GUI 证据生成器。
 *
 * 与 `run.mjs` 的分工：`run.mjs` 驱动的是**默认 Colyseus/GameRoom** 通道（场景只序列化了
 * `serverUrl`/`portalUrl`，`Main.lobbyTransportKind` 恒为缺省 colyseus），因此它再跑一百遍
 * 也证明不了原生通道。本脚本用浏览器预览的 `?lobby=native&lobbyUrl=…` 调试参数显式选择
 * 原生通道，在**真实 Creator 预览 + 真实 serverNew 进程 + 真实 ws**上跑：
 *
 *   登录 → 选服 → Lobby ready → 查询 → 写入 → 运营强制下线(4903) → 恢复
 *
 * ⛔ 不使用任何假 socket / 假 transport：客户端就是预览页里那份 `apps/client` 代码。
 *
 * 用法：
 *   node tools/creator-preview/native-lobby.mjs \
 *        --portal http://127.0.0.1:2570 --lobby-url ws://127.0.0.1:18091 \
 *        [--preview http://127.0.0.1:7458] [--devtools http://127.0.0.1:9222] \
 *        [--scene <uuid>] [--internal http://127.0.0.1:28090] [--secret <gmSecret>] [--sid 1] \
 *        [--out <dir>] [--format jpeg|png] [--boot-timeout <ms>] [--step-timeout <ms>]
 *
 * 退出码 0 = 全部步骤通过 **且 console 无 error/uncaught**；明细与截图写进 `<out>/report.json`。
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CdpClient,
  DEFAULTS,
  acquireTab,
  consoleHookSource,
  openScene,
  pageWalkSource,
  sceneUuidFromMeta,
  selectNodes,
  sleep,
} from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_OUT_ROOT = os.tmpdir();

/** 与 `apps/client/src/app/loginFlow.ts` 的 DEV_LOGIN_KEY 一致；换号 = 换 key。 */
const DEV_LOGIN_KEY = "dev_local";
/** 与 `apps/client/src/shared/protocol/lobbyRpc/push.ts` 的 ForceLogoutMessage[revoked] 一致。 */
const REVOKED_MESSAGE = "账号已被强制下线，请重新登录";

function parseArgv(argv) {
  const options = {
    devtools: DEFAULTS.devtools,
    preview: "http://127.0.0.1:7458",
    scene: null,
    portal: null,
    lobbyUrl: null,
    internal: "http://127.0.0.1:28090",
    secret: null,
    sid: 1,
    out: null,
    format: DEFAULTS.format,
    bootTimeoutMs: DEFAULTS.bootTimeoutMs,
    stepTimeoutMs: 30_000,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    const take = () => {
      index += 1;
      return next;
    };
    switch (key) {
      case "devtools": options.devtools = take(); break;
      case "preview": options.preview = take(); break;
      case "scene": options.scene = take(); break;
      case "portal": options.portal = take(); break;
      case "lobby-url": options.lobbyUrl = take(); break;
      case "internal": options.internal = take(); break;
      case "secret": options.secret = take(); break;
      case "sid": options.sid = Number(take()); break;
      case "out": options.out = take(); break;
      case "format": options.format = take(); break;
      case "boot-timeout": options.bootTimeoutMs = Number(take()); break;
      case "step-timeout": options.stepTimeoutMs = Number(take()); break;
      case "help": options.help = true; break;
      default: throw new Error(`未知参数 --${key}`);
    }
  }
  return options;
}

const usage = () =>
  "用法：node tools/creator-preview/native-lobby.mjs --portal <http origin> --lobby-url <ws origin> " +
  "[--internal <http origin>] [--secret <gmSecret>] [--sid <n>] [--preview <url>] [--devtools <url>] " +
  "[--scene <uuid>] [--out <dir>] [--format jpeg|png] [--boot-timeout <ms>] [--step-timeout <ms>]";

/** 与 `server/scripts/verify/webplatform-local.cjs` 的 devUserId 同式：本地副本的稳定账号。 */
function devUserId(devKey, serverId) {
  return `dev-${crypto.createHash("sha256").update(`${devKey}:${serverId}`).digest("hex").slice(0, 16)}`;
}

/** 运营下线入口：serverNew 的内部 HTTP 动作入口（与 `native-lobby-live.cjs` 同一形状）。 */
function postInternalAction({ origin, secret, payload }) {
  const body = JSON.stringify(payload);
  const target = new URL("/internal/action", origin);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-internal-secret": secret,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: response.statusCode, body: JSON.parse(text) });
          } catch {
            reject(new Error(`内部动作入口返回了非 JSON：${text}`));
          }
        });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

class Runner {
  constructor(client, options, outDir) {
    this.client = client;
    this.options = options;
    this.outDir = outDir;
    this.steps = [];
    this.shotIndex = 0;
    this.lastWalk = null;
    /** 页面实际建立的 WebSocket（Network.webSocketCreated）。⛔ 这是「连的到底是谁」的唯一黑盒证据。 */
    this.sockets = [];
  }

  async walk() {
    this.lastWalk = await this.client.evaluate(pageWalkSource);
    return this.lastWalk;
  }

  find(query) {
    return selectNodes(this.lastWalk, query);
  }

  hasNode(name) {
    return selectNodes(this.lastWalk, { name }).length > 0;
  }

  async step(name, fn) {
    const entry = { name, ok: false, startedAt: new Date().toISOString(), detail: null, screenshots: [] };
    this.steps.push(entry);
    this.currentStep = entry;
    try {
      entry.detail = (await fn()) ?? null;
      entry.ok = true;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
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
    let last = null;
    while (Date.now() < deadline) {
      await sleep(400);
      try {
        await this.walk();
      } catch {
        continue;
      }
      last = pick(this.lastWalk);
      if (last) return last;
    }
    throw new Error(`等待「${what}」超时（${timeoutMs} ms）`);
  }

  async tap(node, label) {
    if (!node?.center) throw new Error(`找不到可点击的 ${label}`);
    await this.client.click(node.center.x, node.center.y);
    return { tapped: label, at: [Math.round(node.center.x), Math.round(node.center.y)] };
  }

  async tapText(text, query = {}) {
    const node = await this.waitFor(`文本「${text}」`, (walk) => selectNodes(walk, { text, ...query })[0] ?? null);
    return this.tap(node, text);
  }

  /**
   * 设置页按稳定节点名定位整卡：先滚入裁剪视口，再重读真实坐标点击。
   *
   * ⚠ `SettingsView.render` 用 `Math.min(offset, …)` 夹取滚动量而**不归零**，所以面板重开时
   *   会保留上次的 offset：首行的「通用设置」（`btn-general`）可能停在视口上方。此时它在 walk
   *   里依然存在、`center` 也非空，但点击坐标落在裁剪区外——**点击不报错，只是什么都没发生**，
   *   表现为「明明找到了卡片、也点了，面板却没进详情」。实测：重登后再进设置，面板比首行下滚了
   *   一整行（`SETTINGS_PLACEHOLDERS` 有 5 项，加通用设置共 6 项 3 行，截图里只剩第 2、3 行）。
   */
  async tapSettingsCard(name) {
    const scroll = await this.client.evaluate(`(${revealSettingsCard.toString()})(${JSON.stringify(name)})`);
    if (!scroll.ok) throw new Error(`无法定位设置卡片 ${name}：${scroll.error}`);
    // ScrollView 的零时长滚动也需等下一帧更新世界变换；不复用滚动前的 walk。
    if (scroll.scrolled) await sleep(100);
    await this.walk();
    const target = this.find({ name, pathIncludes: "SettingsView/panel/viewport/content/" })[0];
    const viewport = this.find({ name: "viewport", pathIncludes: "SettingsView/panel/" })[0];
    if (!target || !viewport) throw new Error(`滚动后找不到设置卡片 ${name} 或其视口`);
    const scaleY = this.lastWalk.canvas.height / this.lastWalk.visible.height;
    const halfHeight = (viewport.center.height * scaleY) / 2;
    if (target.center.y <= viewport.center.y - halfHeight || target.center.y >= viewport.center.y + halfHeight) {
      throw new Error(`设置卡片 ${name} 的点击中心仍在裁剪视口外（scroll=${JSON.stringify(scroll)}）`);
    }
    return { name, scroll, ...(await this.tap(target, name)) };
  }

  async shot(name) {
    this.shotIndex += 1;
    const file = path.join(this.outDir, `${String(this.shotIndex).padStart(2, "0")}-${slug(name)}.${this.options.format}`);
    await this.client.screenshot(file, { format: this.options.format });
    const relative = path.basename(file);
    this.currentStep?.screenshots.push(relative);
    return relative;
  }
}

const slug = (value) => value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 48);

/** 页面侧仅操作 ScrollView；卡片激活始终由随后真实鼠标点击触发。函数须保持自包含。 */
function revealSettingsCard(name) {
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
  const card = scroll?.content?.getChildByName(name);
  const cardTransform = card?.getComponent("cc.UITransform");
  const viewportTransform = viewport?.getComponent("cc.UITransform");
  if (!scroll || !card?.activeInHierarchy || !cardTransform || !viewportTransform) {
    return { ok: false, error: `卡片 ${name} 或 ScrollView 不存在（可能正停在通用设置详情）` };
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

/** 首屏卡片里读账号：`<服名> · <userId> · 体力 N · X胜Y负`。 */
function readAccount(walk) {
  const labels = selectNodes(walk, { pathIncludes: "PromoHomeView", kind: "label" }).map((node) => node.text).filter(Boolean);
  const line = labels.find((text) => /dev-[0-9a-f]{16}/u.test(text)) ?? null;
  const matched = line && /dev-[0-9a-f]{16}/u.exec(line);
  return { line, labels, userId: matched ? matched[0] : null };
}

async function main() {
  const options = parseArgv(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.portal || !options.lobbyUrl) throw new Error(`--portal 与 --lobby-url 必填\n${usage()}`);
  const sceneUuid = options.scene ?? sceneUuidFromMeta(fs.readFileSync(path.join(REPO_ROOT, DEFAULTS.sceneMeta), "utf8"));
  const outDir = path.resolve(
    options.out ?? path.join(DEFAULT_OUT_ROOT, `creator-native-lobby-${new Date().toISOString().replace(/[:.]/gu, "-")}`),
  );
  fs.mkdirSync(outDir, { recursive: true });

  const report = {
    tool: "tools/creator-preview/native-lobby.mjs",
    startedAt: new Date().toISOString(),
    options: { ...options },
    scene: sceneUuid,
    expectedUserId: devUserId(DEV_LOGIN_KEY, options.sid),
    ok: false,
    steps: [],
    console: [],
    sockets: [],
  };
  let client = null;
  let runner = null;
  try {
    const tab = await acquireTab({ devtools: options.devtools, preview: options.preview, reuse: false }).catch((error) => {
      throw new Error(`Chrome 调试端口不可用（${options.devtools}）：${error.message}`);
    });
    report.tab = { id: tab.id, created: tab.created };
    client = await CdpClient.connect(tab.wsUrl);
    runner = new Runner(client, options, outDir);
    // ws 事件必须在导航前订阅：原生端点是在页面启动期连的。
    client.on((message) => {
      if (message.method === "Network.webSocketCreated") runner.sockets.push(message.params.url);
    });
    await client.send("Network.enable");
    await client.send("Page.enable");
    // ⛔ 钩子要在任何页面脚本之前装，否则开机期的 console 记录全漏。
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource });
    await client.evaluate(consoleHookSource);

    const query = {
      server: options.portal,
      lobby: "native",
      lobbyUrl: options.lobbyUrl,
    };
    await runner.step(`加载预览并显式选择原生通道（?lobby=native&lobbyUrl=${options.lobbyUrl}）`, async () => {
      const boot = await openScene(client, {
        preview: options.preview,
        sceneUuid,
        timeoutMs: options.bootTimeoutMs,
        query,
      });
      return {
        query,
        frames: boot.frames,
        canvas: boot.canvas,
        topLevel: boot.nodes.filter((node) => node.depth === 1).map((node) => node.name),
      };
    });

    await runner.step("加载期只有预览自身的热重载通道（游戏连接尚未建立）", async () => {
      const previewHost = new URL(options.preview).host;
      const hostOf = (url) => {
        try {
          return new URL(url).host;
        } catch {
          return null;
        }
      };
      return {
        all: [...runner.sockets],
        previewChannel: runner.sockets.filter((url) => hostOf(url) === previewHost),
        game: runner.sockets.filter((url) => hostOf(url) !== previewHost),
      };
    });

    await runner.step("登录页可见（FGUI btn_login）", async () => {
      const button = await runner.waitFor("btn_login", (walk) => selectNodes(walk, { name: "btn_login" })[0] ?? null, 60_000);
      return { via: "fgui:btn_login", shot: await runner.shot("login"), at: button.center };
    });

    const firstAccount = await runner.step("点「开始游戏」→ Lobby ready → 首屏 PromoHomeView（GetInfo 查询）", async () => {
      await runner.tap(runner.find({ name: "btn_login" })[0], "btn_login");
      await runner.waitFor("PromoHomeView", (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 ? true : null), 90_000);
      await runner.walk();
      const account = readAccount(runner.lastWalk);
      if (!account.userId) throw new Error(`首屏卡片读不到账号：${JSON.stringify(account.labels)}`);
      if (account.userId !== report.expectedUserId)
        throw new Error(`账号与本地 WebPlatform 副本签发的不一致：期望 ${report.expectedUserId}，实际 ${account.userId}`);
      const protocolLine = account.labels.find((text) => text.startsWith("协议 ")) ?? null;
      return { account: account.line, userId: account.userId, protocolLine, shot: await runner.shot("home-native") };
    });

    const sockets = await runner.step("游戏连接只落在原生端点（Network.webSocketCreated）", async () => {
      // ⚠ 预览服务自己用 socket.io 维持一条热重载通道（ws://<preview host>/socket.io/…），
      // 那不是游戏 transport。把它排除掉再断言，否则「连了预览自己」会被误判成「连错了端点」。
      const previewHost = new URL(options.preview).host;
      const hostOf = (url) => {
        try {
          return new URL(url).host;
        } catch {
          return null;
        }
      };
      const game = [...new Set(runner.sockets.filter((url) => hostOf(url) !== previewHost))];
      const expected = new URL(options.lobbyUrl).origin;
      if (game.length === 0) throw new Error(`客户端没有连任何游戏端点（期望 ${options.lobbyUrl}）`);
      const foreign = game.filter((url) => new URL(url).origin !== expected);
      if (foreign.length > 0)
        throw new Error(`客户端连了非原生端点：${foreign.join(", ")}（原生端点 ${options.lobbyUrl}）`);
      return { game, previewChannel: runner.sockets.filter((url) => hostOf(url) === previewHost), expected };
    });

    const write = await runner.step("设置面板：音乐开关幂等写（user.updateProfile）被服务端接受", async () => {
      await runner.tapText("设置", { pathIncludes: "PromoHomeView" });
      await runner.waitFor("SettingsView", (walk) => (selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null));
      const generalTap = await runner.tapSettingsCard("btn-general");
      const before = await runner.waitFor(
        "btn-musicOn 开关",
        (walk) => {
          const control = selectNodes(walk, { name: "btn-musicOn" })[0];
          if (!control) return null;
          const label = selectNodes(walk, { pathIncludes: `${control.path}/`, kind: "label" })[0];
          return { control, state: label?.text ?? null };
        },
        20_000,
      );
      if (before.state !== "开" && before.state !== "关") throw new Error(`音乐开关状态不可读：${JSON.stringify(before.state)}`);
      const shotBefore = await runner.shot(`settings-before-${before.state}`);
      const target = before.state === "开" ? "关" : "开";
      await runner.tap(before.control, "btn-musicOn");
      const after = await runner.waitFor(
        `音乐开关翻转到 ${target}（服务端接受后才不回滚）`,
        (walk) => {
          const control = selectNodes(walk, { name: "btn-musicOn" })[0];
          if (!control) return null;
          const label = selectNodes(walk, { pathIncludes: `${control.path}/`, kind: "label" })[0];
          return label?.text === target ? { state: label.text } : null;
        },
        20_000,
      );
      return { before: before.state, after: after.state, generalTap, shotBefore, shotAfter: await runner.shot(`settings-after-${after.state}`) };
    });

    const kicked = await runner.step("运营强制下线：内部动作入口 → 客户端提示 + 回登录页", async () => {
      const uid = firstAccount.userId;
      const response = await postInternalAction({
        origin: options.internal,
        secret: options.secret,
        payload: { type: "lobbyKick", actionParams: { uid, sId: options.sid } },
      });
      if (response.status !== 200) throw new Error(`内部动作入口 HTTP ${response.status}：${JSON.stringify(response.body)}`);
      if (response.body?.code !== 0) throw new Error(`内部动作入口失败：${JSON.stringify(response.body)}`);
      const kickedFlag = response.body?.data?.json?.kicked;
      if (kickedFlag !== true) throw new Error(`入口必须报告确实踢掉了一个在线连接，实际 ${JSON.stringify(response.body)}`);

      const prompt = await runner.waitFor(
        "强制下线提示",
        (walk) => selectNodes(walk, { kind: "label", text: REVOKED_MESSAGE })[0] ?? null,
        20_000,
      );
      const shot = await runner.shot("kicked-prompt");
      // ⚠ 提示框是**单按钮模态**（`openConfirm({ noText: null })`），`SessionCoordinator` 阻塞在
      //    `await navigator.prompt(...)` 上直到按钮被点——它自己不会超时。所以这里必须点「确定」
      //    按钮本身：早先点的是**文案 label 的中心**，那一点落在按钮上方约 116px 的空白处
      //    （`ConfirmButton` 是 255×102，`Confirm/Message` 在其上方），点击不生效，于是永远
      //    等不到回登录页。文案 label 居中于按钮矩形内，因此按文本取节点即可命中按钮。
      const confirm = await runner.waitFor(
        "强制下线提示「确定」按钮",
        (walk) => selectNodes(walk, { text: "确定", pathIncludes: "Confirm" })[0] ?? null,
        10_000,
      );
      await runner.tap(confirm, "强制下线提示确认");
      await runner.waitFor(
        "回登录页 btn_login",
        (walk) => (selectNodes(walk, { name: "btn_login" }).length > 0 ? true : null),
        30_000,
      );
      return { uid, kicked: kickedFlag, prompt: prompt.text, confirmAt: confirm.center, shot, backToLogin: await runner.shot("kicked-login") };
    });

    await runner.step("恢复：重新登录回到首屏，且写入的偏好被保留（证明写落了真实存储）", async () => {
      await runner.tap(runner.find({ name: "btn_login" })[0], "btn_login");
      await runner.waitFor("PromoHomeView", (walk) => (selectNodes(walk, { name: "PromoHomeView" }).length > 0 ? true : null), 90_000);
      await runner.walk();
      const account = readAccount(runner.lastWalk);
      if (account.userId !== firstAccount.userId)
        throw new Error(`恢复后账号变了：${account.userId}（应为 ${firstAccount.userId}）`);
      await runner.tapText("设置", { pathIncludes: "PromoHomeView" });
      await runner.waitFor("SettingsView", (walk) => (selectNodes(walk, { name: "SettingsView" }).length > 0 ? true : null));
      const generalTap = await runner.tapSettingsCard("btn-general");
      const restored = await runner.waitFor(
        "恢复后的音乐开关状态",
        (walk) => {
          const control = selectNodes(walk, { name: "btn-musicOn" })[0];
          if (!control) return null;
          const label = selectNodes(walk, { pathIncludes: `${control.path}/`, kind: "label" })[0];
          return label?.text ?? null;
        },
        20_000,
      );
      if (restored !== write.after)
        throw new Error(`偏好没有保留：写入后 ${write.after}，重登后 ${restored}`);
      return { userId: account.userId, musicOn: restored, generalTap, shot: await runner.shot("recovered-settings") };
    });

    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (client) {
      try {
        report.console = await client.evaluate("window.__creatorPreviewLogs || []");
      } catch {}
      report.sockets = runner ? runner.sockets : [];
      client.close();
    }
    report.steps = runner ? runner.steps : [];
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }

  for (const step of report.steps)
    console.log(
      `${step.ok ? "✔" : "✘"} ${step.name}${step.error ? ` — ${step.error}` : ""}${step.screenshots.length ? `  [${step.screenshots.join(", ")}]` : ""}`,
    );
  const bad = report.console.filter((entry) => entry.level !== "warn");
  console.log(`页面 console：${report.console.length} 条（error/uncaught ${bad.length} 条）`);
  for (const entry of bad.slice(0, 10)) console.log(`  ✘ [${entry.level}] ${entry.text.slice(0, 300)}`);
  const sockets = report.sockets.length > 0 ? report.sockets.join(", ") : "（无）";
  console.log(`页面 WebSocket：${sockets}`);
  console.log(`${report.ok ? "✔ 全部通过" : `✘ 失败：${report.error}`} → ${outDir}`);
  return report.ok && bad.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
