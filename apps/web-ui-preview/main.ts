import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import { webResourceMap } from "../client/src/ui-uniflex/generated/web-resource-map";
import type { CatalogLeaf } from "./catalog";
import { mountPreviewCatalog, type CatalogPreviewHost } from "./catalog-shell";
import { findSpecimen } from "../client/src/ui-uniflex/modules/preview/ComponentSpecimen/specimens";
import { declarePsdOwnership, stampPsdIdentities } from "./psd-ownership";
import { specimenSkin, startPreview, type PreviewSession } from "./preview-screen";
import { findPreviewScreen, psdComponents, screenCatalog, type ScreenEntry } from "./screens";

const params = new URLSearchParams(location.search);
const requested = params.get("screen") || params.get("ui");
const exportMode = params.get("psd") === "1";
const specimen = requested === "component-specimen" ? findSpecimen(params.get("part")) : null;
const catalogMode = !requested && !exportMode;
if (requested === "component-specimen" && !specimen) {
    throw new Error(`Unknown component specimen: ${params.get("part") ?? ""}`);
}

function notifyPreviewHost(): boolean {
    if (window.parent === window) return false;
    window.parent.postMessage({ type: "uniflex-preview-back" }, location.origin);
    return true;
}
function applyEmbedCanvas(): void {
    // 嵌在目录卡片里时，底色由外层画布绘制。这里保持透明，切换背景不必重载页面。
    if (params.get("embed") === "1") {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        return;
    }
    const mode = params.get("canvas");
    if (mode === "light") document.body.style.background = "#eef0f3";
    else if (mode === "dark") document.body.style.background = "#14161b";
    else if (mode === "checker") {
        document.body.style.backgroundColor = "#f3f4f6";
        document.body.style.backgroundImage = "repeating-conic-gradient(#d4d6dc 0% 25%, #f3f4f6 0% 50%)";
        document.body.style.backgroundSize = "16px 16px";
    } else if (mode === "custom") {
        const color = params.get("canvasColor") ?? "";
        if (/^#[0-9a-fA-F]{6}$/.test(color)) document.body.style.background = color;
    }
}

const CARD_BOOTS = 3;

interface CatalogJob {
    slot: HTMLElement;
    item: CatalogLeaf;
    skin: string;
    cancel: boolean;
    runtime: UniFlexWebRuntime | null;
    dispose(): void;
}

function previewEntry(item: CatalogLeaf): ScreenEntry | null {
    if (item.kind === "component") {
        return {
            id: "component-specimen",
            aliases: [],
            canvas: { width: item.width, height: item.height },
            componentName: "ComponentSpecimen",
            rootName: "ComponentSpecimen",
            source: "apps/client/src/ui-uniflex/modules/preview/ComponentSpecimen/ComponentSpecimen.tsx",
        };
    }
    return findPreviewScreen(item.id);
}

function mountCatalog(): void {
    document.body.classList.add("is-catalog");
    const queue: CatalogJob[] = [];
    const current = new Map<HTMLElement, CatalogJob>();
    let running = 0;
    const pump = () => {
        while (running < CARD_BOOTS && queue.length > 0) {
            const job = queue.shift();
            if (!job || job.cancel || current.get(job.slot) !== job) continue;
            running += 1;
            void bootCard(job).finally(() => {
                running -= 1;
                pump();
            });
        }
    };
    const preview: CatalogPreviewHost = {
        show(slot, item, skin) {
            const restart = current.has(slot);
            preview.hide(slot);
            const job: CatalogJob = {
                slot,
                item,
                skin,
                cancel: false,
                runtime: null,
                dispose() {
                    this.cancel = true;
                    this.runtime?.dispose();
                    this.runtime = null;
                },
            };
            current.set(slot, job);
            if (restart) queue.unshift(job);
            else queue.push(job);
            pump();
        },
        hide(slot) {
            const job = current.get(slot);
            if (!job) return;
            current.delete(slot);
            job.dispose();
        },
    };
    mountPreviewCatalog(screenCatalog.screens, preview);

    async function bootCard(job: CatalogJob): Promise<void> {
        if (job.cancel || current.get(job.slot) !== job) return;
        const entry = previewEntry(job.item);
        if (!entry || job.cancel) return;
        const created = new UniFlexWebRuntime({
            container: job.slot,
            resources: webResourceMap,
            width: entry.canvas.width,
            height: entry.canvas.height,
            loadUI: loadGameUI,
        });
        job.runtime = created;
        if (job.cancel) {
            created.dispose();
            return;
        }
        const session: PreviewSession = {
            get runtime() { return job.runtime ?? created; },
            set runtime(value: UniFlexWebRuntime) { job.runtime = value; },
            recreate: () => new UniFlexWebRuntime({
                container: job.slot,
                resources: webResourceMap,
                width: entry.canvas.width,
                height: entry.canvas.height,
                loadUI: loadGameUI,
            }),
            back: () => {},
            restored: () => {},
            stopped: () => job.cancel,
            dispose: () => job.dispose(),
            part: job.item.kind === "component" ? job.item.id : "",
            skin: specimenSkin(job.skin),
            embedSkin: false,
            setTitle: false,
        };
        try {
            await startPreview(session, entry);
        } catch (error) {
            if (!job.cancel) console.error("[UniFlex Web] 卡片预览失败：", error);
        }
    }
}

if (catalogMode) {
    mountCatalog();
} else {
document.body.classList.add("is-screen");
applyEmbedCanvas();
const active = specimen
    ? {
        id: "component-specimen",
        aliases: [] as readonly string[],
        canvas: { width: specimen.width, height: specimen.height },
        componentName: "ComponentSpecimen",
        rootName: "ComponentSpecimen",
        source: "apps/client/src/ui-uniflex/modules/preview/ComponentSpecimen/ComponentSpecimen.tsx",
    }
    : (requested ? findPreviewScreen(requested) : findPreviewScreen(null));
if (requested && !active) {
    throw new Error(`Unknown UniFlex preview screen: ${requested}`);
}
if (!active) throw new Error("UniFlex preview catalog has no default screen.");

const container = document.getElementById("ui")!;
container.style.width = `${active.canvas.width}px`;
container.style.height = `${active.canvas.height}px`;
const resize = () => {
    const scale = Math.min(innerWidth / active.canvas.width, innerHeight / active.canvas.height);
    container.style.transform = `translate(-50%, -50%) scale(${scale})`;
};
if (exportMode) {
    container.style.left = "0";
    container.style.top = "0";
    container.style.transform = "none";
    container.style.transformOrigin = "top left";
    document.documentElement.style.overflow = "visible";
    document.body.style.overflow = "visible";
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
} else {
    resize();
    window.addEventListener("resize", resize);
}
const createPreviewRuntime = () => new UniFlexWebRuntime({
    container, resources: webResourceMap, width: active.canvas.width, height: active.canvas.height,
    loadUI: loadGameUI,
});
let runtime = createPreviewRuntime();
let stopped = false;
function dispose() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("resize", resize);
    runtime.dispose();
}
function backToPreview() {
    if (notifyPreviewHost()) return;
    location.href = "/";
}
function backToRestored() {
    if (notifyPreviewHost()) return;
    location.href = "/#/v-restored";
}
const session: PreviewSession = {
    get runtime() { return runtime; },
    set runtime(value: UniFlexWebRuntime) { runtime = value; },
    recreate: () => createPreviewRuntime(),
    back: backToPreview,
    restored: backToRestored,
    stopped: () => stopped,
    dispose,
    part: specimen?.id ?? "",
    skin: specimenSkin(params.get("skin")),
    embedSkin: params.get("embed") === "1",
    setTitle: true,
};
window.addEventListener("pagehide", dispose, { once: true });

try {
    await startPreview(session, active);
    const componentDeclarations = declarePsdOwnership(runtime.snapshot(active.canvas.width, active.canvas.height).nodes, {
        key: active.componentName,
        source: active.source,
        rootName: active.rootName,
    }, psdComponents);
    const takeSnapshot = () => {
        const snapshot = runtime.snapshot(active.canvas.width, active.canvas.height);
        return {
            ...snapshot,
            nodes: stampPsdIdentities(snapshot.nodes, componentDeclarations),
            componentDeclarations,
        };
    };
    (window as typeof window & { __UNIFLEX_DESIGN_SNAPSHOT__?: unknown }).__UNIFLEX_DESIGN_SNAPSHOT__ = takeSnapshot();
    // 捕获端滚动 VirtualList 后用它重拍快照（只含新挂载行），由 capture 侧合并。
    (window as typeof window & { __UNIFLEX_RESNAPSHOT__?: unknown }).__UNIFLEX_RESNAPSHOT__ = takeSnapshot;
    document.documentElement.dataset.uniflexReady = "true";
} catch (error) {
    if (!stopped) console.error("[UniFlex Web] 预览启动失败：", error);
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    container.textContent = `预览启动失败：${detail}`;
    container.style.color = "#ff8a80";
    container.style.whiteSpace = "pre-wrap";
    container.style.fontSize = "28px";
    container.style.padding = "40px";
    dispose();
}
}
