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
                    expression: "window.__UNIFLEX_DESIGN_SNAPSHOT__",
                    returnByValue: true,
                });
                const snapshot = result.result?.value;
                if (!snapshot || snapshot.kind !== "uniflex-design-snapshot") return null;
                return snapshot;
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
