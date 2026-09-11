import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Backpack, Confirm, loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import { webResourceMap } from "../client/src/ui-uniflex/generated/web-resource-map";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../client/src/designSpec";
import { ConfirmLogic } from "../client/src/logic/page/ConfirmLogic";

const container = document.getElementById("ui")!;
const screen = new URLSearchParams(location.search).get("screen");
const designHeight = screen === "backpack" ? 1334 : DESIGN_HEIGHT;
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
window.addEventListener("pagehide", dispose, { once: true });
try {
    if (screen === "backpack") {
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
