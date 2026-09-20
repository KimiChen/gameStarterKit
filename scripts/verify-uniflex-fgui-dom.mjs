/**
 * FairyGUI-dom 预览可用性验证：真实 Chrome（CDP）逐屏加载候选导出包，
 * 断言加载成功、无运行时异常、滚动组件可拖、目录跳转与数量控件可用。
 *
 * 需要本机 Chrome（优先复用 9222 调试端口，未开则自起临时实例）。
 * ⛔ 不进 verify:core / test:uniflex-ui-contract（依赖真实浏览器）。
 *
 * 用法：
 *   npm run ui:verify-fgui-dom -- --out .cache/fgui/catalog-all
 *   npm run ui:verify-fgui-dom -- --url http://127.0.0.1:8771/
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flagValue } from "./lib/uniflex-screens.mjs";
import { servePreview } from "./lib/uniflex-fgui/preview.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DEVTOOLS = "http://127.0.0.1:9222";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function listTabs(devtools) {
    const response = await fetch(`${devtools}/json/list`);
    if (!response.ok) throw new Error("Chrome DevTools unavailable");
    return response.json();
}

async function connectChrome(pageUrl, env) {
    const devtools = env.CHROME_DEVTOOLS || DEFAULT_DEVTOOLS;
    let opened = await listTabs(devtools).catch(() => null);
    let child;
    if (!opened) {
        const profile = mkdtempSync(join(tmpdir(), "fgui-dom-verify-chrome-"));
        const port = new URL(devtools).port || "9222";
        child = spawn(env.CHROME_PATH || CHROME, [
            `--remote-debugging-port=${port}`,
            "--remote-debugging-address=127.0.0.1",
            `--user-data-dir=${profile}`,
            "--no-first-run",
            "about:blank",
        ], { stdio: "ignore" });
        const deadline = Date.now() + 20_000;
        while (!opened && Date.now() < deadline) {
            await sleep(300);
            opened = await listTabs(devtools).catch(() => null);
        }
        if (!opened) throw new Error("Chrome DevTools 启动超时");
    }
    const created = await fetch(`${devtools}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" })
        .catch(() => null);
    const tab = created?.ok ? await created.json() : opened.find((item) => item.type === "page") ?? opened[0];
    if (!tab?.webSocketDebuggerUrl) throw new Error("Chrome DevTools 没有可用标签页");
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolvePromise, reject) => {
        ws.addEventListener("open", resolvePromise, { once: true });
        ws.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket error")), { once: true });
    });
    return {
        ws,
        close() {
            try { ws.close(); } catch { /* ignore */ }
            if (child) child.kill("SIGTERM");
        },
    };
}

let nextId = 0;
const pageErrors = [];
function cdp(ws, method, params = {}) {
    const id = ++nextId;
    return new Promise((resolvePromise, reject) => {
        const onMessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.id === id) {
                ws.removeEventListener("message", onMessage);
                if (payload.error) reject(new Error(payload.error.message));
                else resolvePromise(payload.result ?? {});
                return;
            }
            if (payload.method === "Runtime.exceptionThrown") {
                pageErrors.push("exception: " + String(
                    payload.params.exceptionDetails?.exception?.description
                    ?? payload.params.exceptionDetails?.text ?? "").split("\n")[0]);
            } else if (payload.method === "Runtime.consoleAPICalled" && payload.params.type === "error") {
                pageErrors.push("console.error: " + payload.params.args
                    .map((arg) => arg.value ?? arg.description ?? "").join(" ").split("\n")[0]);
            }
        };
        ws.addEventListener("message", onMessage);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(ws, expression) {
    const res = await cdp(ws, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return res.result?.value;
}

async function waitFor(ws, probe, timeoutMs, label) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
        try {
            const value = await probe();
            if (value) return value;
        } catch (error) { last = error; }
        await sleep(200);
    }
    throw last ?? new Error(`超时：${label}`);
}

async function mouseClick(ws, x, y) {
    await cdp(ws, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(120);
    await cdp(ws, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function showScreen(ws, base, id) {
    pageErrors.length = 0;
    await cdp(ws, "Page.navigate", { url: `${base}?screen=${encodeURIComponent(id)}` });
    await waitFor(ws, async () => evaluate(ws,
        "document.documentElement.dataset.fguiReady === 'true' && document.documentElement.dataset.fguiScreen"),
        15_000, `加载 ${id}`);
    return evaluate(ws, "document.documentElement.dataset.fguiScreen");
}

const WALK = `(function walk(root, visit) {
    const stack = [root];
    while (stack.length) {
        const o = stack.pop();
        visit(o);
        if (o.numChildren) for (let i = 0; i < o.numChildren; i++) stack.push(o.getChildAt(i));
    }
})`;

async function checkScreen(ws, base, id) {
    const landed = await showScreen(ws, base, id);
    await sleep(400);
    const info = await evaluate(ws, `(() => {
        const p = window.__FGUI_PREVIEW__;
        if (!p) return null;
        let panes = 0;
        let scrollable = 0;
        if (p.view) {
            ${WALK}(p.view, (o) => {
                const sp = o._scrollPane;
                if (sp) {
                    panes += 1;
                    // ScrollType: 0=horizontal 1=vertical 2=both —只认该轴允许的溢出
                    const v = (sp._scrollType === 1 || sp._scrollType === 2) && sp.contentHeight > sp.viewHeight;
                    const h = (sp._scrollType === 0 || sp._scrollType === 2) && sp.contentWidth > sp.viewWidth;
                    if (v || h) scrollable += 1;
                }
            });
        }
        return { currentId: p.currentId, catalog: !!p.catalog,
            children: p.view ? p.view.numChildren : 0, panes, scrollable };
    })()`);
    const errors = [];
    if (landed !== id) errors.push(`落在 ${landed} 而非 ${id}`);
    if (!info) errors.push("缺少 __FGUI_PREVIEW__");
    else if (!info.catalog && !info.currentId) errors.push("视图未建立");
    errors.push(...pageErrors.slice(0, 5));
    return { id, ok: errors.length === 0, errors, info };
}

async function checkScrollDrag(ws, base, id) {
    const pane = await evaluate(ws, `(() => {
        let found = null;
        const p = window.__FGUI_PREVIEW__;
        if (!p?.view) return null;
        ${WALK}(p.view, (o) => {
            const sp = o._scrollPane;
            if (!sp) return;
            const v = (sp._scrollType === 1 || sp._scrollType === 2) && sp.contentHeight > sp.viewHeight;
            const h = (sp._scrollType === 0 || sp._scrollType === 2) && sp.contentWidth > sp.viewWidth;
            if (!found && (v || h)) found = { o, vertical: v };
        });
        if (!found) return null;
        const { o, vertical } = found;
        window.__verifyPane = o;
        const el = o.element || o._element;
        const r = el.getBoundingClientRect();
        return { posY: o._scrollPane.posY, posX: o._scrollPane.posX, vertical,
            cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    })()`);
    if (!pane) return null;
    const step = pane.vertical ? { dx: 0, dy: -12 } : { dx: -12, dy: 0 };
    await cdp(ws, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: pane.cx, y: pane.cy, button: "left", clickCount: 1,
    });
    for (let i = 1; i <= 10; i += 1) {
        await cdp(ws, "Input.dispatchMouseEvent", {
            type: "mouseMoved", x: pane.cx + step.dx * i, y: pane.cy + step.dy * i, button: "left",
        });
        await sleep(30);
    }
    await cdp(ws, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: pane.cx + step.dx * 10, y: pane.cy + step.dy * 10, button: "left", clickCount: 1,
    });
    await sleep(500);
    const after = await evaluate(ws,
        "({ y: window.__verifyPane._scrollPane.posY, x: window.__verifyPane._scrollPane.posX })");
    const moved = pane.vertical ? after.y > pane.posY : after.x > pane.posX;
    return { moved, from: pane.vertical ? pane.posY : pane.posX, to: pane.vertical ? after.y : after.x };
}

async function checkQuantity(ws) {
    const state = await evaluate(ws, `(() => {
        const named = {};
        const p = window.__FGUI_PREVIEW__;
        if (!p?.view) return null;
        ${WALK}(p.view, (o) => { if (o.name) named[o.name] = o; });
        window.__verifyNamed = named;
        const inc = named["QuantityControl/Increase"];
        if (!inc) return null;
        const el = inc.element || inc._element;
        const r = el.getBoundingClientRect();
        const readQty = () => {
            const texts = [];
            ${WALK}(p.view, (o) => {
                if (!o.numChildren && o.text != null && /^\\d+$/.test(String(o.text).trim())) texts.push(o.text);
            });
            return texts;
        };
        window.__readQty = readQty;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, before: readQty() };
    })()`);
    if (!state) return null;
    await mouseClick(ws, state.x, state.y);
    await sleep(350);
    const after = await evaluate(ws, "window.__readQty()");
    return { before: state.before, after, changed: JSON.stringify(after) !== JSON.stringify(state.before) };
}

async function checkCatalogRoundTrip(ws, base) {
    await showScreen(ws, base, "catalog");
    await sleep(300);
    const target = await evaluate(ws, `(() => {
        const btn = document.querySelector("#catalog button[data-screen]:not([disabled])");
        if (!btn) return null;
        btn.click();
        return btn.getAttribute("data-screen");
    })()`);
    if (!target) return { skipped: true };
    await waitFor(ws, async () => evaluate(ws,
        `document.documentElement.dataset.fguiScreen === ${JSON.stringify(target)}`), 10_000, `目录进入 ${target}`);
    await evaluate(ws, `document.getElementById("home").click()`);
    await waitFor(ws, async () => evaluate(ws,
        "document.documentElement.dataset.fguiScreen"), 10_000, "返回目录");
    const back = await evaluate(ws, "document.documentElement.dataset.fguiScreen");
    return { target, back, ok: Boolean(back) && back !== target };
}

async function main() {
    const args = process.argv.slice(2);
    const out = flagValue(args, "out") ?? ".cache/fgui/catalog";
    const suppliedUrl = flagValue(args, "url");
    let server;
    let base = suppliedUrl;
    let screens;
    try {
        if (!base) {
            server = await servePreview({ root: projectRoot, out, port: 0 });
            base = server.url;
            screens = server.screens.map((entry) => entry.id);
        } else {
            screens = null; // 从页面运行时读取
        }
        const chrome = await connectChrome(base, process.env);
        const ws = chrome.ws;
        try {
            await cdp(ws, "Page.enable");
            await cdp(ws, "Runtime.enable");
            await cdp(ws, "Network.enable");
            await cdp(ws, "Network.setCacheDisabled", { cacheDisabled: true });
            await showScreen(ws, base, "catalog");
            if (!screens) screens = await evaluate(ws, "window.__FGUI_PREVIEW__.screens.map((s) => s.id)");
            console.log(`共 ${screens.length} 屏`);

            const results = [];
            for (const id of screens) {
                const result = await checkScreen(ws, base, id);
                results.push(result);
                const extra = result.info?.scrollable ? ` scroll=${result.info.scrollable}` : "";
                console.log(`${result.ok ? "ok" : "FAIL"} ${id} children=${result.info?.children ?? "?"}${extra}`
                    + (result.errors.length ? ` ${result.errors.join(" | ")}` : ""));
            }

            console.log("--- 滚动拖拽 ---");
            let scrollChecked = 0;
            let scrollFailed = 0;
            for (const id of screens) {
                await showScreen(ws, base, id);
                await sleep(300);
                const drag = await checkScrollDrag(ws, base, id);
                if (!drag) continue;
                scrollChecked += 1;
                if (!drag.moved) scrollFailed += 1;
                console.log(`${drag.moved ? "ok" : "FAIL"} ${id} pos ${drag.from} -> ${drag.to}`);
            }

            console.log("--- 交互 ---");
            const roundTrip = await checkCatalogRoundTrip(ws, base);
            console.log(roundTrip.skipped ? "skip 目录跳转（单屏无目录）"
                : `${roundTrip.ok ? "ok" : "FAIL"} 目录 -> ${roundTrip.target} -> ${roundTrip.back}`);
            let quantity = null;
            for (const id of screens) {
                await showScreen(ws, base, id);
                await sleep(300);
                quantity = await checkQuantity(ws);
                if (quantity) {
                    console.log(`${quantity.changed ? "ok" : "FAIL"} ${id} 数量控件 ${JSON.stringify(quantity.before)} -> ${JSON.stringify(quantity.after)}`);
                    break;
                }
            }
            if (!quantity) console.log("skip 数量控件（无 QuantityControl 屏）");

            const loadFailed = results.filter((entry) => !entry.ok);
            const failed = loadFailed.length + scrollFailed + (roundTrip.ok === false ? 1 : 0)
                + (quantity && !quantity.changed ? 1 : 0);
            console.log(`\n== 汇总：${screens.length - loadFailed.length}/${screens.length} 屏加载通过；`
                + `滚动 ${scrollChecked - scrollFailed}/${scrollChecked}；`
                + `交互${roundTrip.skipped ? "跳过目录" : roundTrip.ok ? "通过" : "失败"}`
                + `${quantity ? (quantity.changed ? "、数量通过" : "、数量失败") : ""} ==`);
            for (const entry of loadFailed) console.log(`  ${entry.id}: ${entry.errors.join(" | ")}`);
            process.exitCode = failed ? 1 : 0;
        } finally {
            chrome.close();
        }
    } finally {
        if (server) await server.close();
    }
}

main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
});
