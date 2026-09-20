import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startUniflexWebPreview } from "../uniflex-web-preview.mjs";
import { findScreen, loadScreenCatalog, resolvePreviewUrl } from "../uniflex-screens.mjs";

const DEFAULT_DEVTOOLS = "http://127.0.0.1:9222";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function captureSnapshot({
    root, screenId, url, startPreview = startUniflexWebPreview, env = process.env,
} = {}) {
    const { results, catalog } = await captureSnapshots({
        root, screens: undefined, screenId, url, startPreview, env,
    });
    const first = results[0];
    return { snapshot: first.snapshot, screen: first.screen, catalog, page: first.page };
}

export async function captureSnapshots({
    root, screens, screenId, url, startPreview = startUniflexWebPreview, env = process.env,
} = {}) {
    const catalog = await loadScreenCatalog(root);
    let wanted = screens;
    if (!wanted) {
        const screen = screenId ? findScreen(catalog, screenId) : findScreen(catalog, null);
        if (screenId && !screen) throw new Error(`Unknown UniFlex preview screen: ${screenId}`);
        wanted = [screen];
    }
    if (!wanted.length) throw new Error("No UniFlex screens to capture.");

    let preview;
    let session;
    try {
        let base = url || env.UNIFLEX_PREVIEW_URL;
        if (!base) {
            preview = await startPreview({ root, port: 0 });
            base = preview.url;
        }
        const firstPage = resolvePreviewUrl(base, wanted[0]);
        session = await connectDevtools(firstPage, env);
        const results = [];
        const failures = [];
        for (const screen of wanted) {
            const page = resolvePreviewUrl(base, screen);
            try {
                const snapshot = await session.capture(page);
                results.push({
                    snapshot: { ...snapshot, screenId: screen.id },
                    screen,
                    page,
                });
            } catch (error) {
                failures.push({ screen: screen.id, error: error.message });
            }
        }
        return { results, failures, catalog };
    } finally {
        session?.close();
        if (preview) await preview.dispose();
    }
}

async function connectDevtools(pageUrl, env) {
    const devtools = env.CHROME_DEVTOOLS || DEFAULT_DEVTOOLS;
    let opened = await listTabs(devtools).catch(() => null);
    let child;
    if (!opened) {
        const profile = mkdtempSync(join(tmpdir(), "uniflex-fgui-chrome-"));
        const port = new URL(devtools).port || "9222";
        child = spawn(env.CHROME_PATH || CHROME, [
            `--remote-debugging-port=${port}`,
            "--remote-debugging-address=127.0.0.1",
            `--user-data-dir=${profile}`,
            "--no-first-run",
            pageUrl,
        ], { stdio: "ignore" });
        opened = await waitFor(() => listTabs(devtools), 20_000);
    }
    const tab = await openTab(devtools, pageUrl);
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await once(ws, "open");
    await cdp(ws, "Page.enable");
    await cdp(ws, "Runtime.enable");
    return {
        async capture(targetUrl) {
            const loaded = waitForCdpEvent(ws, "Page.loadEventFired");
            await cdp(ws, "Page.navigate", { url: targetUrl });
            await Promise.race([loaded, sleep(2_000)]);
            return waitFor(async () => {
                const ready = await cdp(ws, "Runtime.evaluate", {
                    expression: "document.documentElement.dataset.uniflexReady === 'true'",
                    returnByValue: true,
                });
                if (ready.result?.value !== true) return null;
                const result = await cdp(ws, "Runtime.evaluate", {
                    expression: STAMP_INSPECT_TEXT_STYLES,
                    returnByValue: true,
                });
                const snapshot = result.result?.value;
                if (!snapshot || snapshot.kind !== "uniflex-design-snapshot") return null;
                return mergeScrolledRows(ws, snapshot);
            }, 30_000);
        },
        close() {
            try { ws.close(); } catch { /* ignore */ }
            if (child) child.kill("SIGTERM");
        },
    };
}

async function listTabs(devtools) {
    const response = await fetch(`${devtools}/json/list`);
    if (!response.ok) throw new Error(`Chrome DevTools ${devtools} unavailable`);
    return response.json();
}

async function openTab(devtools, url) {
    const created = await fetch(`${devtools}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
        .catch(() => null);
    if (created?.ok) return created.json();
    const tabs = await listTabs(devtools);
    const page = tabs.find((tab) => tab.type === "page") ?? tabs[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("Chrome DevTools 没有可用标签页");
    return page;
}

function cdp(ws, method, params = {}) {
    const id = cdp.nextId = (cdp.nextId ?? 0) + 1;
    return new Promise((resolvePromise, reject) => {
        const onMessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.id !== id) return;
            ws.removeEventListener("message", onMessage);
            if (payload.error) reject(new Error(payload.error.message));
            else resolvePromise(payload.result ?? {});
        };
        ws.addEventListener("message", onMessage);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

function waitForCdpEvent(ws, method) {
    return new Promise((resolvePromise, reject) => {
        const onMessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.method !== method) return;
            ws.removeEventListener("message", onMessage);
            ws.removeEventListener("error", onError);
            resolvePromise(payload.params ?? {});
        };
        const onError = () => {
            ws.removeEventListener("message", onMessage);
            reject(new Error("Chrome DevTools WebSocket error"));
        };
        ws.addEventListener("message", onMessage);
        ws.addEventListener("error", onError, { once: true });
    });
}

function once(ws, type) {
    return new Promise((resolvePromise, reject) => {
        ws.addEventListener(type, resolvePromise, { once: true });
        ws.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket error")), { once: true });
    });
}

function sleep(ms) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Slot-bound text (QuantityControl skin, ActionButton outlineColor) is not in the AOT plan. */
const STAMP_INSPECT_TEXT_STYLES = `(() => {
  const snap = window.__UNIFLEX_DESIGN_SNAPSHOT__;
  if (!snap || snap.kind !== "uniflex-design-snapshot" || !Array.isArray(snap.nodes)) return snap;
  const toHex = (color) => {
    if (!color) return null;
    const value = String(color).trim();
    if (value.startsWith("#")) {
      if (value.length === 4) {
        return ("#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3]).toLowerCase();
      }
      return value.slice(0, 7).toLowerCase();
    }
    const match = value.match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)/);
    if (!match) return null;
    const hex = (n) => Math.round(Number(n)).toString(16).padStart(2, "0");
    return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
  };
  const texts = [...document.querySelectorAll("[data-kind=\\"text\\"]")];
  const taken = new Set();
  for (const node of snap.nodes) {
    if (node.kind !== "text") continue;
    let found = -1;
    for (let i = 0; i < texts.length; i++) {
      if (taken.has(i)) continue;
      const el = texts[i];
      if (node.planId != null && el.dataset.planId && el.dataset.planId !== String(node.planId)) continue;
      if (node.name && el.dataset.name && el.dataset.name !== node.name) continue;
      const got = String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
      const want = String(node.value ?? "").replace(/\\s+/g, " ").trim();
      if (want && got && got !== want) continue;
      if (node.rect) {
        const box = el.getBoundingClientRect();
        if (Math.abs(box.width - node.rect.width) > 3) continue;
        if (Math.abs(box.height - node.rect.height) > 3) continue;
      }
      found = i;
      break;
    }
    if (found < 0) continue;
    taken.add(found);
    const el = texts[found];
    const span = el.querySelector("span") || el;
    const cs = getComputedStyle(span);
    const fontSize = parseFloat(cs.fontSize);
    const color = toHex(cs.color);
    const strokeWidth = parseFloat(cs.webkitTextStrokeWidth || cs.getPropertyValue("-webkit-text-stroke-width") || "0");
    const strokeColor = toHex(cs.webkitTextStrokeColor || cs.getPropertyValue("-webkit-text-stroke-color"));
    if (Number.isFinite(fontSize)) node.fontSize = fontSize;
    if (color) node.color = color;
    if (Number.isFinite(strokeWidth)) node.outlineWidth = strokeWidth / 2;
    if (strokeColor) node.outlineColor = strokeColor;
    const weight = parseFloat(cs.fontWeight);
    if (Number.isFinite(weight)) node.bold = weight >= 700;
    if (cs.textAlign === "center" || cs.textAlign === "right" || cs.textAlign === "left") {
      node.horizontalAlign = cs.textAlign;
    }
  }
  return snap;
})()`;

async function waitFor(probe, timeoutMs) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
        try {
            const value = await probe();
            if (value) return value;
        } catch (error) {
            last = error;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
    throw last ?? new Error("Timed out waiting for UniFlex preview snapshot");
}

/**
 * VirtualList 快照只含可视行：逐屏滚到底，每滚一屏用 `__UNIFLEX_RESNAPSHOT__` 重拍，
 * 把新挂载的行按 rect 去重合并进基础快照。老预览缺钩子或合并失败时原样返回。
 */
const SCROLLABLE_LISTS = '[data-kind="virtual-list"], [data-kind="scroll-view"]';

async function evaluateValue(ws, expression) {
    const result = await cdp(ws, "Runtime.evaluate", { expression, returnByValue: true });
    return result.result?.value;
}

async function mergeScrolledRows(ws, base) {
    try {
        if (!base || !Array.isArray(base.nodes)) return base;
        if (!base.nodes.some((node) => node.kind === "virtual-list" || node.kind === "scroll-view")) return base;
        const hasHook = await evaluateValue(ws, "typeof window.__UNIFLEX_RESNAPSHOT__ === 'function'");
        if (!hasHook) return base;
        let merged = base;
        for (let round = 0; round < 40; round += 1) {
            const moved = await evaluateValue(ws, `(() => {
                let any = false;
                for (const el of document.querySelectorAll('${SCROLLABLE_LISTS}')) {
                    const maxTop = el.scrollHeight - el.clientHeight;
                    if (maxTop <= 4) continue;
                    const next = Math.min(maxTop, el.scrollTop + el.clientHeight);
                    if (next > el.scrollTop) {
                        el.scrollTop = next;
                        el.dispatchEvent(new Event("scroll", { bubbles: true }));
                        any = true;
                    }
                }
                return any;
            })()`);
            if (!moved) break;
            await sleep(350);
            await evaluateValue(ws, "window.__UNIFLEX_DESIGN_SNAPSHOT__ = window.__UNIFLEX_RESNAPSHOT__()");
            const stamped = await cdp(ws, "Runtime.evaluate", {
                expression: STAMP_INSPECT_TEXT_STYLES,
                returnByValue: true,
            });
            const extra = stamped.result?.value;
            if (!extra?.nodes) break;
            merged = mergeListRows(merged, extra);
        }
        await evaluateValue(ws, `for (const el of document.querySelectorAll('${SCROLLABLE_LISTS}')) {
            el.scrollTop = 0;
            el.dispatchEvent(new Event("scroll", { bubbles: true }));
        }`);
        return merged;
    } catch {
        return base;
    }
}

function rectKey(node) {
    if (!node.rect) return null;
    const { x, y, width, height } = node.rect;
    return `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`;
}

export function mergeListRows(base, extra) {
    if (!Array.isArray(extra?.nodes)) return base;
    const baseLists = base.nodes.filter((node) => node.kind === "virtual-list" || node.kind === "scroll-view");
    if (!baseLists.length) return base;
    const extraListByKey = new Map();
    for (const node of extra.nodes) {
        if (node.kind === "virtual-list" || node.kind === "scroll-view") extraListByKey.set(rectKey(node), node);
    }
    let nextId = Math.max(0, ...base.nodes.map((node) => Number(node.id) || 0)) + 1;
    const added = [];
    for (const vl of baseLists) {
        const counter = extraListByKey.get(rectKey(vl));
        if (!counter) continue;
        const existing = new Set(base.nodes.filter((node) => node.parent === vl.id).map(rectKey));
        for (const row of extra.nodes.filter((node) => node.parent === counter.id)) {
            const key = rectKey(row);
            if (!key || existing.has(key)) continue;
            existing.add(key);
            const idMap = new Map();
            const cloneSubtree = (src) => {
                const nid = nextId;
                nextId += 1;
                idMap.set(src.id, nid);
                added.push({ ...src, id: nid, parent: src.parent === counter.id ? vl.id : idMap.get(src.parent) });
                for (const child of extra.nodes.filter((node) => node.parent === src.id)) cloneSubtree(child);
            };
            cloneSubtree(row);
        }
    }
    if (!added.length) return base;
    return { ...base, nodes: [...base.nodes, ...added] };
}
