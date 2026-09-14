import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Backpack, Confirm, PreviewHome, Prompt, SmallPopup, loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import { webResourceMap } from "../client/src/ui-uniflex/generated/web-resource-map";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../client/src/designSpec";
import { ConfirmLogic } from "../client/src/logic/page/ConfirmLogic";

const container = document.getElementById("ui")!;
const screen = new URLSearchParams(location.search).get("screen");
const prompt = new URLSearchParams(location.search).get("ui") === "prompt";
const smallPopup = new URLSearchParams(location.search).get("ui") === "small-popup";
const route = new URLSearchParams(location.search).get("ui");
const designHeight = screen === "backpack" ? 1334 : DESIGN_HEIGHT;
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
    if (!route) {
        await runtime.start(PreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
    } else if (smallPopup) {
        await runtime.start(SmallPopup, { title: "标题", onClose: backToPreview });
    } else if (prompt) {
        await runtime.start(Prompt, { theme: { titleColor: "#ffffff", titleOutline: "#593d84", messageColor: "#3f3254" }, title: "创建角色", message: "在该服务器创建1名新角色?", confirmText: "确定", cancelText: "取消", onConfirm: () => console.info("[UniFlex Prompt] result=true"), onCancel: backToPreview, onClose: backToPreview });
    } else if (screen === "backpack") {
        document.title = "UniFlex Backpack";
        const onAction = (action: BackpackAction) => {
            console.info("[UniFlex Backpack] action", action);
            if (action.action === "back" || action.action === "close") dispose();
        };
        await runtime.start(Backpack, { onAction });
        console.info("[UniFlex Backpack] ready");
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
