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
    const catalog = await loadScreenCatalog(root);
    const screen = screenId ? findScreen(catalog, screenId) : findScreen(catalog, null);
    if (screenId && !screen) throw new Error(`Unknown UniFlex preview screen: ${screenId}`);
    let preview;
    let chrome;
    try {
        let base = url || env.UNIFLEX_PREVIEW_URL;
        if (!base) {
            preview = await startPreview({ root, port: 0 });
            base = preview.url;
        }
        const page = resolvePreviewUrl(base, screen);
        const snapshot = await evaluateSnapshot(page, env);
        return { snapshot, screen, catalog, page };
    } finally {
        if (preview) await preview.dispose();
        if (chrome) chrome.kill("SIGTERM");
    }
}

async function evaluateSnapshot(pageUrl, env) {
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
    try {
        await cdp(ws, "Page.enable");
        await cdp(ws, "Runtime.enable");
        await cdp(ws, "Page.navigate", { url: pageUrl });
        await waitFor(async () => {
            const result = await cdp(ws, "Runtime.evaluate", {
                expression: "document.documentElement.dataset.uniflexReady === 'true'",
                returnByValue: true,
            });
            return result.result?.value === true ? true : null;
        }, 30_000);
        const result = await cdp(ws, "Runtime.evaluate", {
            expression: "window.__UNIFLEX_DESIGN_SNAPSHOT__",
            returnByValue: true,
        });
        const snapshot = result.result?.value;
        if (!snapshot || snapshot.kind !== "uniflex-design-snapshot") {
            throw new Error("Preview did not expose __UNIFLEX_DESIGN_SNAPSHOT__.");
        }
        return snapshot;
    } finally {
        ws.close();
        if (child) child.kill("SIGTERM");
    }
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

function once(ws, type) {
    return new Promise((resolvePromise, reject) => {
        ws.addEventListener(type, resolvePromise, { once: true });
        ws.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket error")), { once: true });
    });
}

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
