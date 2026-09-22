import { Node, UITransform, view } from "cc";
import { DESIGN_HEIGHT } from "../designSpec";
import { UniFlexCocosRuntime } from "../kits/uniflex/api/cocos/index";
import type { BackpackAction } from "./generated/Backpack";
import type { BackpackEditedRestoredAction } from "./generated/BackpackEditedRestored";
import type { BackpackRestoredAction } from "./generated/BackpackRestored";
import type { MailBattleReportParams } from "./generated/MailBattleReport";
import { resourceMap } from "./generated/resource-map";
import {
    Alliance,
    AllianceAnnounce,
    AllianceAnnounceRestored,
    AllianceBoard,
    AllianceBoardRestored,
    AllianceCreate,
    AllianceCreateRestored,
    AllianceGift,
    AllianceGiftRestored,
    AllianceHelp,
    AllianceHelpRestored,
    AllianceInvite,
    AllianceInviteRestored,
    AllianceJoin,
    AllianceJoinRestored,
    AllianceMarchBoost,
    AllianceMarchBoostRestored,
    AllianceMemberSettings,
    AllianceMemberSettingsRestored,
    AllianceRestored,
    AllianceTech,
    AllianceTechRestored,
    AllianceTerritory,
    AllianceTerritoryRestored,
    AllianceWar,
    AllianceWarRestored,
    Backpack,
    BackpackEditedRestored,
    BackpackRestored,
    CharacterManage,
    CharacterManageRestored,
    ComponentGallery,
    Confirm,
    ConfirmRestored,
    HeroDetail,
    HeroDetailRestored,
    HeroScreen,
    HeroScreenRestored,
    HeroStarUpgrade,
    HeroStarUpgradeRestored,
    MailBattleReport,
    MailBattleReportRestored,
    PreviewHome,
    PreviewHomeRestored,
    RestoredPreviewHome,
    Settings,
    SettingsRestored,
    Shop,
    ShopGetItem,
    ShopGetItemRestored,
    SmallPopup,
    SmallPopupRestored,
    loadGameUI,
} from "./generated/ui";

export type PreviewNavigate = (target: string) => void;

export type PreviewHandle = {
    ready: Promise<void>;
    dispose(): void;
};

const HEIGHT_1424 = new Set(["preview-home", "restored-home", "component-gallery"]);
const HEIGHT_1334 = new Set([
    "backpack",
    "backpack-restored",
    "backpack-edited",
    "mail",
    "mail-restored",
    "settings",
    "settings-restored",
    "hero",
    "hero-restored",
    "preview-home-restored",
]);

const PREVIEW_ALIASES: Record<string, string> = {
    home: "preview-home",
    restored: "restored-home",
    restore: "restored-home",
    "restored-preview": "restored-home",
    "character-manage": "character",
    "hero-screen": "hero",
    herodetail: "hero-detail",
    herostarupgrade: "hero-star-upgrade",
    allianceannounce: "alliance-announce",
    alliancecreate: "alliance-create",
    alliancejoin: "alliance-join",
    alliancemembersettings: "alliance-member-settings",
    alliancewar: "alliance-war",
    allianceterritory: "alliance-territory",
    alliancemarchboost: "alliance-march-boost",
    allianceinvite: "alliance-invite",
    alliancegift: "alliance-gift",
    alliancehelp: "alliance-help",
    allianceboard: "alliance-board",
    alliancetech: "alliance-tech",
    shopgetitem: "shop-getitem",
    components: "component-gallery",
    "ui-components": "component-gallery",
    previewhomerestored: "preview-home-restored",
    backpackedited: "backpack-edited",
};

export function previewCanvasHeight(id: string): number {
    if (HEIGHT_1424.has(id)) return 1424;
    if (HEIGHT_1334.has(id)) return 1334;
    return DESIGN_HEIGHT;
}

export function resolvePreviewScreenId(raw: string | null | undefined): string {
    const key = (raw ?? "").trim().toLowerCase();
    if (!key) return "preview-home";
    return PREVIEW_ALIASES[key] ?? key;
}

export function catalogHomeFor(id: string): string {
    if (id === "preview-home" || id === "restored-home" || id === "preview-home-restored") return id;
    if (id === "backpack-edited" || id.endsWith("-restored")) return "restored-home";
    return "preview-home";
}

function mountPreview(
    parent: Node,
    name: string,
    start: (runtime: UniFlexCocosRuntime, dispose: () => void) => Promise<unknown>,
): PreviewHandle {
    const root = new Node(name);
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
        ready: Promise.resolve(start(runtime, dispose)).then(() => undefined),
        dispose,
    };
}

function onPreviewMainNav(slot: string, label: string, back: () => void): void {
    console.info(label, slot);
    if (slot === "wheel") back();
}

async function startPreviewScreen(
    runtime: UniFlexCocosRuntime,
    id: string,
    hooks: {
        query: URLSearchParams | null;
        back: () => void;
        navigate: PreviewNavigate;
    },
): Promise<void> {
    const { query, back, navigate } = hooks;
    const hasCancel = query?.get("cancel") !== "0";
    switch (id) {
        case "preview-home":
            await runtime.start(PreviewHome, { onNavigate: navigate });
            return;
        case "restored-home":
            await runtime.start(RestoredPreviewHome, { onNavigate: navigate });
            return;
        case "preview-home-restored":
            await runtime.start(PreviewHomeRestored, { onNavigate: navigate });
            return;
        case "component-gallery":
            await runtime.start(ComponentGallery, { onBack: back });
            return;
        case "small-popup":
            await runtime.start(SmallPopup, { title: "标题", onClose: back });
            return;
        case "confirm":
            await runtime.start(Confirm, {
                theme: { messageColor: "#3f3254" },
                title: "创建角色",
                message: "在该服务器创建1名新角色?",
                confirmText: "确定",
                cancelText: hasCancel ? "取消" : null,
                onConfirm: () => console.info("[UniFlex Confirm] result=true"),
                onCancel: back,
                onClose: back,
            });
            return;
        case "backpack": {
            const onAction = (action: BackpackAction): void => {
                console.info("[UniFlex Backpack] action", action);
                if (action.action === "back" || action.action === "close") back();
            };
            await runtime.start(Backpack, { onAction });
            return;
        }
        case "mail": {
            const mailParams: MailBattleReportParams = {
                onBack: back,
                onDeleteRead: () => console.info("[UniFlex MailBattleReport] delete-read"),
                onConfirm: () => console.info("[UniFlex MailBattleReport] confirm"),
            };
            await runtime.start(MailBattleReport, mailParams);
            return;
        }
        case "settings":
            await runtime.start(Settings, {
                onClose: back,
                onSelect: (itemId) => console.info("[UniFlex Settings] select", itemId),
            });
            return;
        case "character":
            await runtime.start(CharacterManage, {
                onClose: back,
                onSelectPlayer: (playerId) => console.info("[UniFlex CharacterManage] player", playerId),
                onSelectServer: (serverId) => console.info("[UniFlex CharacterManage] server", serverId),
            });
            return;
        case "hero":
            await runtime.start(HeroScreen, {
                onRecruit: () => console.info("[UniFlex HeroScreen] recruit"),
                onSelectCard: () => navigate("hero-detail"),
                onSelectBond: (bondId) => console.info("[UniFlex HeroScreen] bond", bondId),
                onBondDetail: (bondId) => console.info("[UniFlex HeroScreen] bond-detail", bondId),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex HeroScreen] nav", back),
            });
            return;
        case "hero-detail":
            await runtime.start(HeroDetail, {
                onBack: back,
                onPrev: () => console.info("[UniFlex HeroDetail] prev"),
                onNext: () => console.info("[UniFlex HeroDetail] next"),
                onStarUp: () => console.info("[UniFlex HeroDetail] star-up"),
                onConfirmStarUpgrade: () => console.info("[UniFlex HeroDetail] confirm-star-upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroDetail] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroDetail] exchange"),
                onUpgrade: () => console.info("[UniFlex HeroDetail] upgrade"),
                onSelectSkill: (skillId) => console.info("[UniFlex HeroDetail] skill", skillId),
            });
            return;
        case "hero-star-upgrade":
            await runtime.start(HeroStarUpgrade, {
                onClose: back,
                onUpgrade: () => console.info("[UniFlex HeroStarUpgrade] upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroStarUpgrade] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroStarUpgrade] exchange"),
            });
            return;
        case "alliance":
            await runtime.start(Alliance, {
                onAction: (actionId) => console.info("[UniFlex Alliance] action", actionId),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex Alliance] nav", back),
                onSelectTab: (tab) => console.info("[UniFlex Alliance] tab", tab),
            });
            return;
        case "alliance-announce":
            await runtime.start(AllianceAnnounce, { onClose: back });
            return;
        case "alliance-create":
            await runtime.start(AllianceCreate, {
                onClose: back,
                onCreate: () => console.info("[UniFlex AllianceCreate] create"),
                onChangeBanner: () => console.info("[UniFlex AllianceCreate] change-banner"),
            });
            return;
        case "alliance-join":
            await runtime.start(AllianceJoin, {
                onBack: back,
                onSearch: (search) => console.info("[UniFlex AllianceJoin] search", search),
                onCreate: () => console.info("[UniFlex AllianceJoin] create"),
                onJoin: (joinId) => console.info("[UniFlex AllianceJoin] join", joinId),
                onAction: (actionId) => console.info("[UniFlex AllianceJoin] action", actionId),
            });
            return;
        case "alliance-member-settings":
            await runtime.start(AllianceMemberSettings, {
                onClose: back,
                onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettings] r2", enabled),
                onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettings] r3", enabled),
            });
            return;
        case "alliance-war":
            await runtime.start(AllianceWar, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex AllianceWar] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceWar] tab", tab),
            });
            return;
        case "alliance-territory":
            await runtime.start(AllianceTerritory, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex AllianceTerritory] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceTerritory] tab", tab),
            });
            return;
        case "alliance-march-boost":
            await runtime.start(AllianceMarchBoost, {
                onClose: back,
                onPayGem: () => console.info("[UniFlex AllianceMarchBoost] pay-gem"),
                onPayCoin: () => console.info("[UniFlex AllianceMarchBoost] pay-coin"),
            });
            return;
        case "alliance-invite":
            await runtime.start(AllianceInvite, {
                onClose: back,
                onSearch: (search) => console.info("[UniFlex AllianceInvite] search", search),
                onInvite: () => console.info("[UniFlex AllianceInvite] invite"),
                onPublicInvite: () => console.info("[UniFlex AllianceInvite] public"),
            });
            return;
        case "alliance-gift":
            await runtime.start(AllianceGift, {
                onBack: back,
                onClaimAll: () => console.info("[UniFlex AllianceGift] claim-all"),
                onAction: (actionId) => console.info("[UniFlex AllianceGift] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceGift] tab", tab),
            });
            return;
        case "alliance-help":
            await runtime.start(AllianceHelp, {
                onClose: back,
                onCreate: () => console.info("[UniFlex AllianceHelp] create"),
                onAction: (actionId) => console.info("[UniFlex AllianceHelp] action", actionId),
            });
            return;
        case "alliance-board":
            await runtime.start(AllianceBoard, {
                onBack: back,
                onSend: (text) => console.info("[UniFlex AllianceBoard] send", text),
                onAction: (actionId) => console.info("[UniFlex AllianceBoard] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceBoard] tab", tab),
            });
            return;
        case "alliance-tech":
            await runtime.start(AllianceTech, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex AllianceTech] action", actionId),
            });
            return;
        case "shop-getitem":
            await runtime.start(ShopGetItem, {
                onClose: back,
                onChange: (quantity) => console.info("[UniFlex ShopGetItem] quantity", quantity),
                onBuy: (quantity) => console.info("[UniFlex ShopGetItem] buy", quantity),
            });
            return;
        case "shop":
            await runtime.start(Shop, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex Shop] action", actionId),
            });
            return;
        case "confirm-restored":
            await runtime.start(ConfirmRestored, {
                theme: { messageColor: "#3f3254" },
                title: "创建角色",
                message: "在该服务器创建1名新角色?",
                confirmText: "确定",
                cancelText: hasCancel ? "取消" : null,
                onConfirm: () => console.info("[UniFlex ConfirmRestored] result=true"),
                onCancel: back,
                onClose: back,
            });
            return;
        case "small-popup-restored":
            await runtime.start(SmallPopupRestored, { title: "标题", onClose: back });
            return;
        case "settings-restored":
            await runtime.start(SettingsRestored, {
                onClose: back,
                onSelect: (itemId) => console.info("[UniFlex SettingsRestored] select", itemId),
            });
            return;
        case "character-restored":
            await runtime.start(CharacterManageRestored, {
                onClose: back,
                onSelectPlayer: (playerId) => console.info("[UniFlex CharacterManageRestored] player", playerId),
                onSelectServer: (serverId) => console.info("[UniFlex CharacterManageRestored] server", serverId),
            });
            return;
        case "hero-restored":
            await runtime.start(HeroScreenRestored, {
                onRecruit: () => console.info("[UniFlex HeroScreenRestored] recruit"),
                onSelectCard: () => navigate("hero-detail-restored"),
                onSelectBond: (bondId) => console.info("[UniFlex HeroScreenRestored] bond", bondId),
                onBondDetail: (bondId) => console.info("[UniFlex HeroScreenRestored] bond-detail", bondId),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex HeroScreenRestored] nav", back),
            });
            return;
        case "hero-detail-restored":
            await runtime.start(HeroDetailRestored, {
                onBack: back,
                onPrev: () => console.info("[UniFlex HeroDetailRestored] prev"),
                onNext: () => console.info("[UniFlex HeroDetailRestored] next"),
                onStarUp: () => console.info("[UniFlex HeroDetailRestored] star-up"),
                onConfirmStarUpgrade: () => console.info("[UniFlex HeroDetailRestored] confirm-star-upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroDetailRestored] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroDetailRestored] exchange"),
                onUpgrade: () => console.info("[UniFlex HeroDetailRestored] upgrade"),
                onSelectSkill: (skillId) => console.info("[UniFlex HeroDetailRestored] skill", skillId),
            });
            return;
        case "hero-star-upgrade-restored":
            await runtime.start(HeroStarUpgradeRestored, {
                onClose: back,
                onUpgrade: () => console.info("[UniFlex HeroStarUpgradeRestored] upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroStarUpgradeRestored] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroStarUpgradeRestored] exchange"),
            });
            return;
        case "alliance-restored":
            await runtime.start(AllianceRestored, {
                onAction: (actionId) => console.info("[UniFlex AllianceRestored] action", actionId),
                onNav: (slot) => console.info("[UniFlex AllianceRestored] nav", slot),
                onSelectTab: (tab) => console.info("[UniFlex AllianceRestored] tab", tab),
            });
            return;
        case "alliance-announce-restored":
            await runtime.start(AllianceAnnounceRestored, { onClose: back });
            return;
        case "alliance-create-restored":
            await runtime.start(AllianceCreateRestored, {
                onClose: back,
                onCreate: () => console.info("[UniFlex AllianceCreateRestored] create"),
                onChangeBanner: () => console.info("[UniFlex AllianceCreateRestored] change-banner"),
            });
            return;
        case "alliance-join-restored":
            await runtime.start(AllianceJoinRestored, {
                onBack: back,
                onSearch: (search) => console.info("[UniFlex AllianceJoinRestored] search", search),
                onCreate: () => console.info("[UniFlex AllianceJoinRestored] create"),
                onJoin: (joinId) => console.info("[UniFlex AllianceJoinRestored] join", joinId),
                onAction: (actionId) => console.info("[UniFlex AllianceJoinRestored] action", actionId),
            });
            return;
        case "alliance-member-settings-restored":
            await runtime.start(AllianceMemberSettingsRestored, {
                onClose: back,
                onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettingsRestored] r2", enabled),
                onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettingsRestored] r3", enabled),
            });
            return;
        case "alliance-war-restored":
            await runtime.start(AllianceWarRestored, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex AllianceWarRestored] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceWarRestored] tab", tab),
            });
            return;
        case "alliance-territory-restored":
            await runtime.start(AllianceTerritoryRestored, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex AllianceTerritoryRestored] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceTerritoryRestored] tab", tab),
            });
            return;
        case "alliance-march-boost-restored":
            await runtime.start(AllianceMarchBoostRestored, {
                onClose: back,
                onPayGem: () => console.info("[UniFlex AllianceMarchBoostRestored] pay-gem"),
                onPayCoin: () => console.info("[UniFlex AllianceMarchBoostRestored] pay-coin"),
            });
            return;
        case "alliance-invite-restored":
            await runtime.start(AllianceInviteRestored, {
                onClose: back,
                onSearch: (search) => console.info("[UniFlex AllianceInviteRestored] search", search),
                onInvite: () => console.info("[UniFlex AllianceInviteRestored] invite"),
                onPublicInvite: () => console.info("[UniFlex AllianceInviteRestored] public"),
            });
            return;
        case "alliance-gift-restored":
            await runtime.start(AllianceGiftRestored, {
                onBack: back,
                onClaimAll: () => console.info("[UniFlex AllianceGiftRestored] claim-all"),
                onAction: (actionId) => console.info("[UniFlex AllianceGiftRestored] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceGiftRestored] tab", tab),
            });
            return;
        case "alliance-help-restored":
            await runtime.start(AllianceHelpRestored, {
                onClose: back,
                onCreate: () => console.info("[UniFlex AllianceHelpRestored] create"),
                onAction: (actionId) => console.info("[UniFlex AllianceHelpRestored] action", actionId),
            });
            return;
        case "alliance-board-restored":
            await runtime.start(AllianceBoardRestored, {
                onBack: back,
                onSend: (text) => console.info("[UniFlex AllianceBoardRestored] send", text),
                onAction: (actionId) => console.info("[UniFlex AllianceBoardRestored] action", actionId),
                onSelectTab: (tab) => console.info("[UniFlex AllianceBoardRestored] tab", tab),
            });
            return;
        case "alliance-tech-restored":
            await runtime.start(AllianceTechRestored, {
                onBack: back,
                onAction: (actionId) => console.info("[UniFlex AllianceTechRestored] action", actionId),
            });
            return;
        case "shop-getitem-restored":
            await runtime.start(ShopGetItemRestored, {
                onClose: back,
                onChange: (quantity) => console.info("[UniFlex ShopGetItemRestored] quantity", quantity),
                onBuy: (quantity) => console.info("[UniFlex ShopGetItemRestored] buy", quantity),
            });
            return;
        case "mail-restored":
            await runtime.start(MailBattleReportRestored, {
                onBack: back,
                onDeleteRead: () => console.info("[UniFlex MailBattleReportRestored] delete-read"),
                onConfirm: () => console.info("[UniFlex MailBattleReportRestored] confirm"),
            });
            return;
        case "backpack-restored": {
            const onAction = (action: BackpackRestoredAction): void => {
                console.info("[UniFlex BackpackRestored] action", action);
                if (action.action === "back" || action.action === "close") back();
            };
            await runtime.start(BackpackRestored, { onAction });
            return;
        }
        case "backpack-edited": {
            const onAction = (action: BackpackEditedRestoredAction): void => {
                console.info("[UniFlex BackpackEditedRestored] action", action);
                if (action.action === "back" || action.action === "close") back();
            };
            await runtime.start(BackpackEditedRestored, { onAction });
            return;
        }
        default:
            throw new Error(`No UniFlex preview starter for screen: ${id}`);
    }
}

export function createPreviewScreen(
    parent: Node,
    id: string,
    options: {
        query?: URLSearchParams | null;
        navigate?: PreviewNavigate;
    } = {},
): PreviewHandle {
    const go = options.navigate;
    const query = options.query ?? null;
    const home = catalogHomeFor(id);
    return mountPreview(parent, `UniFlex:${id}`, (runtime, dispose) => {
        const back = (): void => {
            if (go) go(home);
            else dispose();
        };
        const navigate: PreviewNavigate = (target) => {
            if (go) go(target);
        };
        return startPreviewScreen(runtime, id, { query, back, navigate });
    });
}

export function createPreviewHomePreview(parent: Node, onNavigate: PreviewNavigate): PreviewHandle {
    return createPreviewScreen(parent, "preview-home", { navigate: onNavigate });
}

export function createRestoredPreviewHomePreview(parent: Node, onNavigate: PreviewNavigate): PreviewHandle {
    return createPreviewScreen(parent, "restored-home", { navigate: onNavigate });
}

export function createSmallPopupPreview(parent: Node): PreviewHandle {
    return createPreviewScreen(parent, "small-popup");
}
