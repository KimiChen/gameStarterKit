import { Node, UITransform, view } from "cc";
import { UniFlexCocosRuntime } from "../kits/uniflex/api/cocos/index";
import { Backpack, CharacterManage, Confirm, MailBattleReport, Prompt, Settings, loadGameUI } from "./generated/ui";
import type { BackpackAction } from "./generated/Backpack";
import type { MailBattleReportParams } from "./generated/MailBattleReport";
import { resourceMap } from "./generated/resource-map";
import { ConfirmLogic } from "../logic/page/ConfirmLogic";
import { BackpackLogic } from "../logic/page/BackpackLogic";

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

export function createBackpackPreview(
    parent: Node,
    onAction: (action: BackpackAction) => void = (action) =>
        console.info("[UniFlex Backpack] action", action),
) {
    const root = new Node("UniFlexBackpack");
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
    const logic = new BackpackLogic();
    let disposed = false;
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
    return {
        ready: runtime.start(Backpack, {
            onAction: (action) => {
                logic.onAction(action);
                onAction(action);
                if (action.action === "back" || action.action === "close") dispose();
            },
        }),
        dispose,
    };
}

export function createPromptPreview(parent: Node, hasCancel: boolean) {
    const root = new Node("UniFlexPrompt");
    root.layer = parent.layer;
    const transform = root.addComponent(UITransform);
    parent.addChild(root);
    const resize = (): void => { const size = view.getVisibleSize(); transform.setContentSize(size.width, size.height); };
    resize();
    view.on("canvas-resize", resize);
    const runtime = new UniFlexCocosRuntime({ container: root, resources: resourceMap, loadUI: loadGameUI });
    let disposed = false;
    const dispose = (): void => { if (disposed) return; disposed = true; view.off("canvas-resize", resize); try { runtime.dispose(); } finally { root.destroy(); } };
    return {
        ready: runtime.start(Prompt, { theme: { titleColor: "#ffffff", titleOutline: "#593d84", messageColor: "#3f3254" }, title: "创建角色", message: "在该服务器创建1名新角色?", confirmText: "确定", cancelText: hasCancel ? "取消" : null, onConfirm: () => console.info("[UniFlex Prompt] result=true"), onCancel: dispose, onClose: dispose }),
        dispose,
    };
}

export function createMailBattleReportPreview(
    parent: Node,
    params: MailBattleReportParams = {},
) {
    const root = new Node("UniFlexMailBattleReport");
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
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        view.off("canvas-resize", resize);
        try { runtime.dispose(); } finally { root.destroy(); }
    };
    return {
        ready: runtime.start(MailBattleReport, {
            ...params,
            onBack: () => { params.onBack?.(); dispose(); },
        }),
        dispose,
    };
}

export function createSettingsPreview(parent: Node) {
    const root = new Node("UniFlexSettings");
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
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        view.off("canvas-resize", resize);
        try { runtime.dispose(); } finally { root.destroy(); }
    };
    return {
        ready: runtime.start(Settings, {
            onClose: dispose,
            onSelect: (id) => console.info("[UniFlex Settings] select", id),
        }),
        dispose,
    };
}

export function createCharacterManagePreview(parent: Node) {
    const root = new Node("UniFlexCharacterManage");
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
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        view.off("canvas-resize", resize);
        try { runtime.dispose(); } finally { root.destroy(); }
    };
    return {
        ready: runtime.start(CharacterManage, {
            onClose: dispose,
            onSelectPlayer: (id) => console.info("[UniFlex CharacterManage] player", id),
            onSelectServer: (id) => console.info("[UniFlex CharacterManage] server", id),
        }),
        dispose,
    };
}
