import { Node, UITransform, view } from "cc";
import { UniFlexCocosRuntime } from "../kits/uniflex/api/cocos/index";
import { Confirm, loadGameUI } from "./generated/ui";
import { resourceMap } from "./generated/resource-map";
import { ConfirmLogic } from "../logic/page/ConfirmLogic";

export function createConfirmPreview(parent: Node, hasCancel: boolean) {
    const root = new Node("UniFlex");
    root.layer = parent.layer;
    const transform = root.addComponent(UITransform);
    parent.addChild(root);
    const resize = (): void => {
        const size = view.getVisibleSize();
        transform.setContentSize(size.width, size.height);
    };
    resize();
    view.on("canvas-resize", resize);
    const runtime = new UniFlexCocosRuntime({ container: root, resources: resourceMap, loadUI: loadGameUI });
    let disposed = false;
    const logic = new ConfirmLogic({
            title: "UniFlex Confirm",
            content: "这是 UniFlex 在 gameStarterKit 中的本地运行预览。",
            yesText: "确定",
            noText: hasCancel ? "取消" : null,
            onYes: () => console.info("[UniFlex Confirm] result=true"),
            onNo: () => console.info("[UniFlex Confirm] result=false"),
    });
    const dispose = (): void => {
            if (disposed) return;
            disposed = true;
            view.off("canvas-resize", resize);
            try {
                runtime.dispose();
            } finally {
                root.destroy();
            }
    };
    logic.onClose = dispose;
    return {
        ready: runtime.start(Confirm, { logic, isActive: () => !disposed }),
        dispose,
    };
}
