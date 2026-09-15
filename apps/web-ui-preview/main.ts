import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Backpack, BackpackRestored, CharacterManage, Confirm, MailBattleReport, MailBattleReportRestored, PreviewHome, Prompt, Settings, SmallPopup, loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import type { BackpackRestoredAction } from "../client/src/ui-uniflex/generated/BackpackRestored";
import type { MailBattleReportParams } from "../client/src/ui-uniflex/generated/MailBattleReport";
import type { MailBattleReportRestoredAction } from "../client/src/ui-uniflex/generated/MailBattleReportRestored";
import { webResourceMap } from "../client/src/ui-uniflex/generated/web-resource-map";
import { ConfirmLogic } from "../client/src/logic/page/ConfirmLogic";
import { declarePsdOwnership, stampPsdIdentities } from "./psd-ownership";
import { findPreviewScreen, screenCatalog, type ScreenEntry } from "./screens";

const params = new URLSearchParams(location.search);
const requested = params.get("screen") || params.get("ui");
const active = requested ? findPreviewScreen(requested) : findPreviewScreen(null);
if (requested && !active) {
    throw new Error(`Unknown UniFlex preview screen: ${requested}`);
}
if (!active) throw new Error("UniFlex preview catalog has no default screen.");

const exportMode = params.get("psd") === "1";
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
const runtime = new UniFlexWebRuntime({
    container, resources: webResourceMap, width: active.canvas.width, height: active.canvas.height,
    loadUI: loadGameUI,
});
let stopped = false;
function dispose() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("resize", resize);
    runtime.dispose();
}
function backToPreview() {
    location.href = "/";
}
window.addEventListener("pagehide", dispose, { once: true });

async function startScreen(entry: ScreenEntry): Promise<void> {
    document.title = `UniFlex ${entry.componentName}`;
    switch (entry.id) {
        case "preview-home":
            await runtime.start(PreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "prompt":
            await runtime.start(Prompt, {
                theme: { titleColor: "#ffffff", titleOutline: "#593d84", messageColor: "#3f3254" },
                title: "创建角色",
                message: "在该服务器创建1名新角色?",
                confirmText: "确定",
                cancelText: "取消",
                onConfirm: () => console.info("[UniFlex Prompt] result=true"),
                onCancel: backToPreview,
                onClose: backToPreview,
            });
            return;
        case "small-popup":
            await runtime.start(SmallPopup, { title: "标题", onClose: backToPreview });
            return;
        case "confirm": {
            const logic = new ConfirmLogic({
                title: "UniFlex Confirm",
                content: "这是 UniFlex 在 gameStarterKit 中的本地运行预览。",
                noText: params.get("cancel") === "0" ? null : "取消",
                onYes: () => console.info("[UniFlex Confirm] result=true"),
                onNo: () => console.info("[UniFlex Confirm] result=false"),
            });
            logic.onClose = dispose;
            await runtime.start(Confirm, { logic, isActive: () => !stopped });
            return;
        }
        case "backpack": {
            const onAction = (action: BackpackAction) => {
                console.info("[UniFlex Backpack] action", action);
                if (action.action === "back" || action.action === "close") backToPreview();
            };
            await runtime.start(Backpack, { onAction });
            return;
        }
        case "mail": {
            const mailParams: MailBattleReportParams = {
                onBack: backToPreview,
                onDeleteRead: () => console.info("[UniFlex MailBattleReport] delete-read"),
                onConfirm: () => console.info("[UniFlex MailBattleReport] confirm"),
            };
            await runtime.start(MailBattleReport, mailParams);
            return;
        }
        case "mail-restored": {
            const onAction = (action: MailBattleReportRestoredAction) => {
                console.info("[UniFlex MailBattleReportRestored] action", action);
                if (action.action === "back" || action.action === "close") backToPreview();
            };
            await runtime.start(MailBattleReportRestored, { onAction });
            return;
        }
        case "backpack-restored": {
            const onAction = (action: BackpackRestoredAction) => {
                console.info("[UniFlex BackpackRestored] action", action);
                if (action.action === "back" || action.action === "close") backToPreview();
            };
            await runtime.start(BackpackRestored, { onAction });
            return;
        }
        case "settings":
            await runtime.start(Settings, {
                onClose: backToPreview,
                onSelect: (id) => console.info("[UniFlex Settings] select", id),
            });
            return;
        case "character":
            await runtime.start(CharacterManage, {
                onClose: backToPreview,
                onSelectPlayer: (id) => console.info("[UniFlex CharacterManage] player", id),
                onSelectServer: (id) => console.info("[UniFlex CharacterManage] server", id),
            });
            return;
        default:
            throw new Error(`No UniFlex preview starter for screen: ${entry.id}`);
    }
}

try {
    await startScreen(active);
    const snapshot = runtime.snapshot(active.canvas.width, active.canvas.height);
    const componentDeclarations = declarePsdOwnership(snapshot.nodes, {
        key: active.componentName,
        source: active.source,
        rootName: active.rootName,
    }, screenCatalog.components);
    (window as typeof window & { __UNIFLEX_DESIGN_SNAPSHOT__?: unknown }).__UNIFLEX_DESIGN_SNAPSHOT__ = {
        ...snapshot,
        nodes: stampPsdIdentities(snapshot.nodes, componentDeclarations),
        componentDeclarations,
    };
    document.documentElement.dataset.uniflexReady = "true";
} catch (error) {
    if (!stopped) console.error("[UniFlex Web] 预览启动失败：", error);
    dispose();
}
