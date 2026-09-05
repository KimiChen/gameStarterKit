/**
 * Creator 预览驱动：纯函数 + 最小 CDP 客户端（Node 22+ 自带 WebSocket，⛔ 零 npm 依赖）。
 *
 * 用途：把 Cocos Creator 3.8.8 的桌面预览（`http://localhost:7456`）当真实引擎跑一遍登录 → 首屏 → 设置 →
 * 插件入口，产出可复核的截图 + 断言 JSON（docs/evidence 的生成器）。⛔ 不进 verify:core：它需要编辑器、
 * Chrome 9222、本地栈与游戏服四个外部进程，属人工触发的证据动线，不是门禁。
 *
 * 三个已知坑（2026-09-05 实测）：
 * 1. 预览页 index.html 写死 `settings.js?scene=current_scene`（= 编辑器当前打开的场景）；编辑器没开场景时
 *    预览是空场景。这里用 `Fetch` 域把 `scene=` 改写为目标场景 uuid（默认读 `apps/Cocos/assets/scene.scene.meta`）。
 * 2. 页面不可见（`document.hidden`）时没有 rAF，Cocos 根本不启动——必须是真实 Chrome 的可见标签页，
 *    不能用应用内隐藏的浏览器面板。
 * 3. 编辑器只在应用激活时重编译脚本；预览拿到的可能是旧 chunk。改了源码要先激活 Creator 再跑。
 */
import fs from "node:fs";
import path from "node:path";

export const DESIGN = Object.freeze({ width: 375, height: 812 });
export const DEFAULTS = Object.freeze({
  devtools: "http://127.0.0.1:9222",
  preview: "http://localhost:7456",
  sceneMeta: "apps/Cocos/assets/scene.scene.meta",
  format: "jpeg",
  bootTimeoutMs: 300_000,
  stepTimeoutMs: 20_000,
});

/** 命令行参数（纯函数，便于测试）。首个非 `--` 参数是场景名。 */
export function parseArgs(argv) {
  const options = { scenario: null, out: null, code: "WELCOME2026", format: DEFAULTS.format, devtools: DEFAULTS.devtools, preview: DEFAULTS.preview, scene: null, bootTimeoutMs: DEFAULTS.bootTimeoutMs, stepTimeoutMs: DEFAULTS.stepTimeoutMs, reuse: false };
  const takeValue = (name, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} 需要参数`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") options.out = takeValue(arg, index++);
    else if (arg === "--code") options.code = takeValue(arg, index++);
    else if (arg === "--format") {
      options.format = takeValue(arg, index++);
      if (options.format !== "jpeg" && options.format !== "png") throw new Error(`--format 只接受 jpeg|png，得到 ${options.format}`);
    } else if (arg === "--devtools") options.devtools = takeValue(arg, index++);
    else if (arg === "--preview") options.preview = takeValue(arg, index++);
    else if (arg === "--scene") options.scene = takeValue(arg, index++);
    else if (arg === "--boot-timeout") options.bootTimeoutMs = positiveInt(arg, takeValue(arg, index++));
    else if (arg === "--step-timeout") options.stepTimeoutMs = positiveInt(arg, takeValue(arg, index++));
    else if (arg === "--reuse") options.reuse = true;
    else if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg.startsWith("--")) throw new Error(`未知参数：${arg}`);
    else if (options.scenario === null) options.scenario = arg;
    else throw new Error(`多余的位置参数：${arg}`);
  }
  return options;
}

function positiveInt(name, raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 需要正整数毫秒，得到 ${raw}`);
  return value;
}

/** 从 Creator 的 `.scene.meta` 文本里取场景 uuid（严格 JSON，缺 uuid 报错而不是猜）。 */
export function sceneUuidFromMeta(text) {
  const parsed = JSON.parse(text);
  if (typeof parsed.uuid !== "string" || !/^[0-9a-f-]{36}$/u.test(parsed.uuid)) throw new Error("scene.meta 缺少合法 uuid");
  return parsed.uuid;
}

/** 把预览页请求里的 `scene=current_scene` 改写为目标 uuid；没有 scene 参数的 URL 原样返回。 */
export function rewriteSceneQuery(url, sceneUuid) {
  if (!/[?&]scene=/u.test(url)) return url;
  return url.replace(/([?&])scene=[^&]*/u, `$1scene=${sceneUuid}`);
}

/**
 * 引擎世界坐标（原点 = 可见区左下角，单位 = 设计像素）→ 页面 CSS 像素。
 * ⚠ 该函数会被序列化注入页面执行，⛔ 不得引用模块作用域的任何东西。
 */
export function worldToPage(world, visible, origin, canvas) {
  return {
    x: canvas.x + ((world.x - origin.x) / visible.width) * canvas.width,
    y: canvas.y + (1 - (world.y - origin.y) / visible.height) * canvas.height,
  };
}

/** 设计坐标（375×812、原点左上）→ 页面 CSS 像素；只给没有可读节点的兜底场景用。 */
export function designToPage(design, canvas) {
  return { x: canvas.x + (design.x / DESIGN.width) * canvas.width, y: canvas.y + (design.y / DESIGN.height) * canvas.height };
}

/**
 * 页面侧场景遍历：列出激活节点的名字、文本（Label/EditBox）、FGUI 对象类型与中心点页面坐标。
 * 以字符串形式注入（`pageWalkSource`），⛔ 函数体不得引用模块作用域。
 */
function pageWalk(toPage) {
  if (typeof cc === "undefined" || !cc.director || !cc.director.getScene()) return null;
  const scene = cc.director.getScene();
  const element = document.getElementById("GameCanvas");
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const canvas = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  const visible = cc.view.getVisibleSize();
  const origin = cc.view.getVisibleOrigin();
  const nodes = [];
  const walk = (node, nodePath, depth) => {
    if (!node.activeInHierarchy) return;
    const transform = node.getComponent("cc.UITransform");
    const label = node.getComponent("cc.Label");
    const edit = node.getComponent("cc.EditBox");
    let center = null;
    if (transform) {
      const anchor = transform.anchorPoint;
      const world = transform.convertToWorldSpaceAR(new cc.Vec3((0.5 - anchor.x) * transform.width, (0.5 - anchor.y) * transform.height, 0));
      center = toPage({ x: world.x, y: world.y }, { width: visible.width, height: visible.height }, { x: origin.x, y: origin.y }, canvas);
      center.width = transform.width;
      center.height = transform.height;
    }
    // FGUI 对象（fairygui-cc 把 GObject 挂在 node.$gobj）：GTextField 的 text / GButton 的 title 不一定落成 cc.Label
    //（位图字、图片标题），所以文本优先读组件，再退到 FGUI 对象的 text/title。
    const gobj = node.$gobj;
    const fguiText = gobj ? (typeof gobj.text === "string" && gobj.text) || (typeof gobj.title === "string" && gobj.title) || null : null;
    nodes.push({
      path: nodePath,
      name: node.name,
      depth,
      kind: edit ? "editbox" : label ? "label" : gobj ? `fgui:${(gobj.constructor && gobj.constructor.name) || "GObject"}` : "node",
      text: edit ? edit.string : label ? label.string : fguiText,
      center,
    });
    for (const child of node.children) walk(child, `${nodePath}/${child.name}`, depth + 1);
  };
  walk(scene, scene.name, 0);
  return { frames: cc.director.getTotalFrames(), sceneName: scene.name, canvas, visible: { width: visible.width, height: visible.height }, origin: { x: origin.x, y: origin.y }, nodes };
}

export const pageWalkSource = `(${pageWalk.toString()})(${worldToPage.toString()})`;

/** 页面侧 console/未捕获异常钩子（幂等）；读取用 `window.__creatorPreviewLogs`。 */
export const consoleHookSource = `(() => {
  if (window.__creatorPreviewLogs) return "already";
  const logs = (window.__creatorPreviewLogs = []);
  const push = (level, args) => { try { logs.push({ level, at: Date.now(), text: args.map((a) => (a && a.stack) || String(a)).join(" ").slice(0, 2000) }); } catch {} };
  for (const level of ["error", "warn"]) { const original = console[level].bind(console); console[level] = (...args) => { push(level, args); original(...args); }; }
  window.addEventListener("error", (event) => push("uncaught", [event.message || event.error]));
  window.addEventListener("unhandledrejection", (event) => push("rejection", [event.reason]));
  return "installed";
})()`;

/** 在遍历结果里按文本/名字挑节点（纯函数）。 */
export function selectNodes(walk, query) {
  if (!walk) return [];
  return walk.nodes.filter((node) => {
    if (!node.center) return false;
    if (query.name !== undefined && node.name !== query.name) return false;
    if (query.namePrefix !== undefined && !node.name.startsWith(query.namePrefix)) return false;
    if (query.kind !== undefined && node.kind !== query.kind) return false;
    if (query.text !== undefined && node.text !== query.text) return false;
    if (query.textIncludes !== undefined && !(typeof node.text === "string" && node.text.includes(query.textIncludes))) return false;
    if (query.textMatches !== undefined && !(typeof node.text === "string" && query.textMatches.test(node.text))) return false;
    if (query.pathIncludes !== undefined && !node.path.includes(query.pathIncludes)) return false;
    return true;
  });
}

/** 多个候选时取离锚点纵向最近的一个（同一行的按钮）。 */
export function nearestByRow(candidates, anchor) {
  let best = null;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.center.y - anchor.center.y);
    if (best === null || distance < best.distance) best = { node: candidate, distance };
  }
  return best ? best.node : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 最小 CDP 客户端。 */
export class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message ?? "CDP error"} ${JSON.stringify(message.error)}`));
        else resolve(message.result);
        return;
      }
      if (message.method) for (const handler of this.handlers) handler(message);
    });
  }

  static async connect(wsUrl) {
    const socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error(`无法连接 ${wsUrl}`)), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(handler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((entry) => entry !== handler);
    };
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async click(x, y) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(60);
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }

  async insertText(text) {
    for (const char of text) {
      await this.send("Input.insertText", { text: char });
      await sleep(30);
    }
  }

  async screenshot(file, { clip, format = "jpeg", quality = 85 } = {}) {
    const params = { format };
    if (format === "jpeg") params.quality = quality;
    if (clip) params.clip = clip;
    const result = await this.send("Page.captureScreenshot", params);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    return file;
  }

  close() {
    this.socket.close();
  }
}

/** 取一个可驱动的标签页：优先复用已打开的预览页，否则新建；返回 ws URL。 */
export async function acquireTab({ devtools, preview, reuse }) {
  const list = await (await fetch(`${devtools}/json`)).json();
  const existing = list.find((tab) => tab.type === "page" && tab.url.startsWith(preview));
  if (reuse && existing) return { wsUrl: existing.webSocketDebuggerUrl, id: existing.id, created: false };
  const created = await (await fetch(`${devtools}/json/new?${preview}/`, { method: "PUT" })).json();
  return { wsUrl: created.webSocketDebuggerUrl, id: created.id, created: true };
}

/**
 * 导航到预览并把 `scene=` 改写为目标场景；轮询到场景里出现 Canvas 且已渲染 >30 帧为止。
 * 首次加载会按需编译全部 TS（实测 77～125 s），超时默认 5 分钟。
 */
export async function openScene(client, { preview, sceneUuid, timeoutMs }) {
  const off = client.on((message) => {
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, request } = message.params;
    client.send("Fetch.continueRequest", { requestId, url: rewriteSceneQuery(request.url, sceneUuid) }).catch(() => {});
  });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*settings.js*", requestStage: "Request" }] });
  await client.send("Page.enable");
  await client.send("Page.bringToFront");
  await client.send("Page.navigate", { url: `${preview}/` });
  const deadline = Date.now() + timeoutMs;
  let last = null;
  try {
    while (Date.now() < deadline) {
      await sleep(2000);
      try {
        last = await client.evaluate(pageWalkSource);
      } catch {
        last = null;
      }
      if (last && last.frames > 30 && last.nodes.some((node) => node.depth === 1 && node.name === "Canvas")) return last;
    }
    throw new Error(`场景 ${sceneUuid} 在 ${timeoutMs} ms 内未就绪；最后状态：${last ? `${last.frames} 帧、顶层 ${last.nodes.filter((n) => n.depth === 1).map((n) => n.name).join(",")}` : "cc 未初始化"}`);
  } finally {
    await client.send("Fetch.disable").catch(() => {});
    off();
  }
}
