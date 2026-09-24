import { createPreviewScreen } from "./previewCatalog";
import { Node, UITransform, view } from "cc";
import { UniFlexCocosRuntime } from "../kits/uniflex/api/cocos/index";
import { Alliance, AllianceAnnounce, AllianceBoard, AllianceCreate, AllianceGift, AllianceHelp, AllianceInvite, AllianceJoin, AllianceMarchBoost, AllianceMemberSettings, AllianceTech, AllianceTerritory, AllianceWar, Backpack, CharacterManage, ComponentGallery, Confirm, HeroDetail, HeroScreen, HeroStarUpgrade, MailBattleReport, Defeat, RewardObtain, Settings, Shop, ShopGetItem, Victory, loadGameUI } from "./generated/ui";
import type { BackpackAction } from "./generated/Backpack";
import type { MailBattleReportParams } from "./generated/MailBattleReport";
import { resourceMap } from "./generated/resource-map";
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
        ready: runtime.start(Confirm, {
            theme: { messageColor: "#3f3254" },
            title: "创建角色",
            message: "在该服务器创建1名新角色?",
            confirmText: "确定",
            cancelText: hasCancel ? "取消" : null,
            onConfirm: () => console.info("[UniFlex Confirm] result=true"),
            onCancel: dispose,
            onClose: dispose,
        }),
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

export function createComponentGalleryPreview(parent: Node) {
    const root = new Node("UniFlexComponentGallery");
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
        ready: runtime.start(ComponentGallery, { onBack: dispose }),
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

export function createHeroScreenPreview(parent: Node) {
    const root = new Node("UniFlexHeroScreen");
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
        ready: runtime.start(HeroScreen, {
            onRecruit: () => console.info("[UniFlex HeroScreen] recruit"),
            onSelectCard: (id) => console.info("[UniFlex HeroScreen] card", id),
            onSelectBond: (id) => console.info("[UniFlex HeroScreen] bond", id),
            onBondDetail: (id) => console.info("[UniFlex HeroScreen] bond-detail", id),
            onNav: (slot) => console.info("[UniFlex HeroScreen] nav", slot),
        }),
        dispose,
    };
}

export function createHeroDetailPreview(parent: Node) {
    const root = new Node("UniFlexHeroDetail");
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
        ready: runtime.start(HeroDetail, {
            stars: 6,
            onBack: dispose,
            onPrev: () => console.info("[UniFlex HeroDetail] prev"),
            onNext: () => console.info("[UniFlex HeroDetail] next"),
            onStarUp: () => console.info("[UniFlex HeroDetail] star-up"),
            onConfirmStarUpgrade: () => console.info("[UniFlex HeroDetail] confirm-star-upgrade"),
            onObtainFragments: () => console.info("[UniFlex HeroDetail] obtain-fragments"),
            onExchange: () => console.info("[UniFlex HeroDetail] exchange"),
            onUpgrade: () => console.info("[UniFlex HeroDetail] upgrade"),
            onSelectSkill: (id) => console.info("[UniFlex HeroDetail] skill", id),
        }),
        dispose,
    };
}

export function createAlliancePreview(parent: Node) {
    const root = new Node("UniFlexAlliance");
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
        ready: runtime.start(Alliance, {
            onAction: (id) => console.info("[UniFlex Alliance] action", id),
            onNav: (slot) => console.info("[UniFlex Alliance] nav", slot),
            onSelectTab: (tab) => console.info("[UniFlex Alliance] tab", tab),
        }),
        dispose,
    };
}

export function createAllianceAnnouncePreview(parent: Node) {
    const root = new Node("UniFlexAllianceAnnounce");
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
        ready: runtime.start(AllianceAnnounce, {
            onClose: dispose,
        }),
        dispose,
    };
}

export function createAllianceJoinPreview(parent: Node) {
    const root = new Node("UniFlexAllianceJoin");
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
        ready: runtime.start(AllianceJoin, {
            onBack: dispose,
            onSearch: (query) => console.info("[UniFlex AllianceJoin] search", query),
            onCreate: () => console.info("[UniFlex AllianceJoin] create"),
            onJoin: (id) => console.info("[UniFlex AllianceJoin] join", id),
            onAction: (id) => console.info("[UniFlex AllianceJoin] action", id),
        }),
        dispose,
    };
}

export function createAllianceMemberSettingsPreview(parent: Node) {
    const root = new Node("UniFlexAllianceMemberSettings");
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
        ready: runtime.start(AllianceMemberSettings, {
            onClose: dispose,
            onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettings] r2", enabled),
            onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettings] r3", enabled),
        }),
        dispose,
    };
}

export function createAllianceTechPreview(parent: Node) {
    const root = new Node("UniFlexAllianceTech");
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
        ready: runtime.start(AllianceTech, {
            onBack: dispose,
            onAction: (id) => console.info("[UniFlex AllianceTech] action", id),
        }),
        dispose,
    };
}

export function createAllianceBoardPreview(parent: Node) {
    const root = new Node("UniFlexAllianceBoard");
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
        ready: runtime.start(AllianceBoard, {
            onBack: dispose,
            onSend: (text) => console.info("[UniFlex AllianceBoard] send", text),
            onAction: (id) => console.info("[UniFlex AllianceBoard] action", id),
            onSelectTab: (tab) => console.info("[UniFlex AllianceBoard] tab", tab),
        }),
        dispose,
    };
}

export function createAllianceHelpPreview(parent: Node) {
    const root = new Node("UniFlexAllianceHelp");
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
        ready: runtime.start(AllianceHelp, {
            onClose: dispose,
            onCreate: () => console.info("[UniFlex AllianceHelp] create"),
            onAction: (id) => console.info("[UniFlex AllianceHelp] action", id),
        }),
        dispose,
    };
}

export function createAllianceGiftPreview(parent: Node) {
    const root = new Node("UniFlexAllianceGift");
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
        ready: runtime.start(AllianceGift, {
            onBack: dispose,
            onClaimAll: () => console.info("[UniFlex AllianceGift] claim-all"),
            onAction: (id) => console.info("[UniFlex AllianceGift] action", id),
            onSelectTab: (tab) => console.info("[UniFlex AllianceGift] tab", tab),
        }),
        dispose,
    };
}

export function createAllianceWarPreview(parent: Node) {
    const root = new Node("UniFlexAllianceWar");
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
        ready: runtime.start(AllianceWar, {
            onBack: dispose,
            onAction: (id) => console.info("[UniFlex AllianceWar] action", id),
            onSelectTab: (tab) => console.info("[UniFlex AllianceWar] tab", tab),
        }),
        dispose,
    };
}

export function createAllianceTerritoryPreview(parent: Node) {
    const root = new Node("UniFlexAllianceTerritory");
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
        ready: runtime.start(AllianceTerritory, {
            onBack: dispose,
            onAction: (id) => console.info("[UniFlex AllianceTerritory] action", id),
            onSelectTab: (tab) => console.info("[UniFlex AllianceTerritory] tab", tab),
        }),
        dispose,
    };
}

export function createAllianceCreatePreview(parent: Node) {
    const root = new Node("UniFlexAllianceCreate");
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
        ready: runtime.start(AllianceCreate, {
            onClose: dispose,
            onCreate: () => console.info("[UniFlex AllianceCreate] create"),
            onChangeBanner: () => console.info("[UniFlex AllianceCreate] change-banner"),
        }),
        dispose,
    };
}

export function createAllianceInvitePreview(parent: Node) {
    const root = new Node("UniFlexAllianceInvite");
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
        ready: runtime.start(AllianceInvite, {
            onClose: dispose,
            onSearch: (query) => console.info("[UniFlex AllianceInvite] search", query),
            onInvite: () => console.info("[UniFlex AllianceInvite] invite"),
            onPublicInvite: () => console.info("[UniFlex AllianceInvite] public"),
        }),
        dispose,
    };
}

export function createAllianceMarchBoostPreview(parent: Node) {
    const root = new Node("UniFlexAllianceMarchBoost");
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
        ready: runtime.start(AllianceMarchBoost, {
            onClose: dispose,
            onPayGem: () => console.info("[UniFlex AllianceMarchBoost] pay-gem"),
            onPayCoin: () => console.info("[UniFlex AllianceMarchBoost] pay-coin"),
        }),
        dispose,
    };
}

export function createShopPreview(parent: Node) {
    const root = new Node("UniFlexShop");
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
        ready: runtime.start(Shop, {
            onBack: dispose,
            onAction: (id) => console.info("[UniFlex Shop] action", id),
        }),
        dispose,
    };
}

export function createShopGetItemPreview(parent: Node) {
    const root = new Node("UniFlexShopGetItem");
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
        ready: runtime.start(ShopGetItem, {
            onClose: dispose,
            onChange: (quantity) => console.info("[UniFlex ShopGetItem] quantity", quantity),
            onBuy: (quantity) => console.info("[UniFlex ShopGetItem] buy", quantity),
        }),
        dispose,
    };
}

export function createRewardObtainPreview(parent: Node) {
    const root = new Node("UniFlexRewardObtain");
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
        ready: runtime.start(RewardObtain, {
            onClose: () => {
                console.info("[UniFlex RewardObtain] close");
                dispose();
            },
        }),
        dispose,
    };
}

export function createVictoryPreview(parent: Node) {
    const root = new Node("UniFlexVictory");
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
        ready: runtime.start(Victory, {
            onClose: () => {
                console.info("[UniFlex Victory] close");
                dispose();
            },
        }),
        dispose,
    };
}

export function createDefeatPreview(parent: Node) {
    const root = new Node("UniFlexDefeat");
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
        ready: runtime.start(Defeat, {
            onClose: () => {
                console.info("[UniFlex Defeat] close");
                dispose();
            },
            onWay: (id) => console.info("[UniFlex Defeat] way", id),
        }),
        dispose,
    };
}

export function createHeroStarUpgradePreview(parent: Node) {
    const root = new Node("UniFlexHeroStarUpgrade");
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
        ready: runtime.start(HeroStarUpgrade, {
            stars: 6,
            onClose: dispose,
            onUpgrade: () => console.info("[UniFlex HeroStarUpgrade] upgrade"),
            onObtainFragments: () => console.info("[UniFlex HeroStarUpgrade] obtain-fragments"),
            onExchange: () => console.info("[UniFlex HeroStarUpgrade] exchange"),
        }),
        dispose,
    };
}

export {
    createPreviewHomePreview,
    createPreviewScreen,
    createRestoredPreviewHomePreview,
    createSmallPopupPreview,
    previewCanvasHeight,
    resolvePreviewScreenId,
} from "./previewCatalog";

/** Standalone 邮件 popup preview; the catalog owns its 750×1624 canvas and callbacks. */
export function createMailPreview(parent: Node) {
    const preview = createPreviewScreen(parent, "mail-popup", { query: null, navigate: () => preview.dispose() });
    return preview;
}

/** Battle report detail with one continuous comparison list. */
export function createMailReportDetailPreview(parent: Node): { dispose(): void } {
    const preview = createPreviewScreen(parent, "mail-report-detail", { query: null, navigate: () => preview.dispose() });
    return preview;
}

/** Independent battle log with collapsible lineups and rounds. */
export function createMailBattleLogPreview(parent: Node): { dispose(): void } {
    const preview = createPreviewScreen(parent, "mail-battle-log", { query: null, navigate: () => preview.dispose() });
    return preview;
}

/** Troop bonus comparison details, separate from the battle log. */
export function createMailTroopDetailsPreview(parent: Node): { dispose(): void } {
    const preview = createPreviewScreen(parent, "mail-troop-details", { query: null, navigate: () => preview.dispose() });
    return preview;
}

/** Soldier casualty details grouped by player. */
export function createMailSoldierDetailsPreview(parent: Node): { dispose(): void } {
    const preview = createPreviewScreen(parent, "mail-soldier-details", { query: null, navigate: () => preview.dispose() });
    return preview;
}

/** Mail report share destination selection. */
export function createMailSharePreview(parent: Node): { dispose(): void } {
    const preview = createPreviewScreen(parent, "mail-share", { query: null, navigate: () => preview.dispose() });
    return preview;
}
