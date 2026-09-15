import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Backpack, Confirm, MailBattleReport, PreviewHome, Prompt, Settings, SmallPopup, loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import type { MailBattleReportParams } from "../client/src/ui-uniflex/generated/MailBattleReport";
import { webResourceMap } from "../client/src/ui-uniflex/generated/web-resource-map";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../client/src/designSpec";
import { ConfirmLogic } from "../client/src/logic/page/ConfirmLogic";

const container = document.getElementById("ui")!;
const screen = new URLSearchParams(location.search).get("screen");
const prompt = new URLSearchParams(location.search).get("ui") === "prompt";
const smallPopup = new URLSearchParams(location.search).get("ui") === "small-popup";
const route = new URLSearchParams(location.search).get("ui");
const designHeight = screen === "backpack" || route === "backpack" ? 1334
    : screen === "mail" || route === "mail" || screen === "settings" || route === "settings" ? 1334
    : DESIGN_HEIGHT;
container.style.height = `${designHeight}px`;
const resize = () => {
    const scale = Math.min(innerWidth / DESIGN_WIDTH, innerHeight / designHeight);
    container.style.transform = `translate(-50%, -50%) scale(${scale})`;
};
resize();
window.addEventListener("resize", resize);
const runtime = new UniFlexWebRuntime({
    container, resources: webResourceMap, width: DESIGN_WIDTH, height: designHeight,
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
    location.href = '/';
}
window.addEventListener("pagehide", dispose, { once: true });
try {
    if (!route && !screen) {
        await runtime.start(PreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
    } else if (smallPopup) {
        await runtime.start(SmallPopup, { title: "标题", onClose: backToPreview });
    } else if (prompt) {
        await runtime.start(Prompt, { theme: { titleColor: "#ffffff", titleOutline: "#593d84", messageColor: "#3f3254" }, title: "创建角色", message: "在该服务器创建1名新角色?", confirmText: "确定", cancelText: "取消", onConfirm: () => console.info("[UniFlex Prompt] result=true"), onCancel: backToPreview, onClose: backToPreview });
    } else if (screen === "backpack" || route === "backpack") {
        document.title = "UniFlex Backpack";
        const onAction = (action: BackpackAction) => {
            console.info("[UniFlex Backpack] action", action);
            if (action.action === "back" || action.action === "close") backToPreview();
        };
        await runtime.start(Backpack, { onAction });
        console.info("[UniFlex Backpack] ready");
    } else if (screen === "mail" || route === "mail") {
        document.title = "UniFlex Mail Battle Report";
        const params: MailBattleReportParams = {
            onBack: backToPreview,
            onDeleteRead: () => console.info("[UniFlex MailBattleReport] delete-read"),
            onConfirm: () => console.info("[UniFlex MailBattleReport] confirm"),
        };
        await runtime.start(MailBattleReport, params);
        console.info("[UniFlex MailBattleReport] ready");
    } else if (screen === "settings" || route === "settings") {
        document.title = "UniFlex Settings";
        await runtime.start(Settings, {
            onClose: backToPreview,
            onSelect: (id) => console.info("[UniFlex Settings] select", id),
        });
        console.info("[UniFlex Settings] ready");
    } else {
    const logic = new ConfirmLogic({
        title: "UniFlex Confirm",
        content: "这是 UniFlex 在 gameStarterKit 中的本地运行预览。",
        noText: new URLSearchParams(location.search).get("cancel") === "0" ? null : "取消",
        onYes: () => console.info("[UniFlex Confirm] result=true"),
        onNo: () => console.info("[UniFlex Confirm] result=false"),
    });
    logic.onClose = dispose;
    await runtime.start(Confirm, { logic, isActive: () => !stopped });
    }
} catch (error) {
    if (!stopped) console.error("[UniFlex Web] 预览启动失败：", error);
    dispose();
}
