import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Alliance, AllianceAnnounce, AllianceAnnounceRestored, AllianceBoard, AllianceBoardRestored, AllianceCreate, AllianceCreateRestored, AllianceGift, AllianceGiftRestored, AllianceHelp, AllianceHelpRestored, AllianceInvite, AllianceInviteRestored, AllianceJoin, AllianceJoinRestored, AllianceMarchBoost, AllianceMarchBoostRestored, AllianceMemberSettings, AllianceMemberSettingsRestored, AllianceRestored, AllianceTech, AllianceTechRestored, AllianceTerritory, AllianceTerritoryRestored, AllianceWar, AllianceWarRestored, Backpack, BackpackEditedRestored, BackpackRestored, CharacterManage, CharacterManageRestored, ComponentGallery, ComponentSpecimen, Confirm, ConfirmRestored, HeroDetail, HeroDetailRestored, HeroScreen, HeroScreenRestored, HeroStarUpgrade, HeroStarUpgradeRestored, MailBattleReport, MailBattleReportRestored, PreviewHome, PreviewHomeRestored, Prompt, PromptRestored, RestoredPreviewHome, Settings, SettingsRestored, Shop, ShopGetItem, ShopGetItemRestored, SmallPopup, SmallPopupRestored, loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import type { BackpackEditedRestoredAction } from "../client/src/ui-uniflex/generated/BackpackEditedRestored";
import type { BackpackRestoredAction } from "../client/src/ui-uniflex/generated/BackpackRestored";
import type { MailBattleReportParams } from "../client/src/ui-uniflex/generated/MailBattleReport";
import { webResourceMap } from "../client/src/ui-uniflex/generated/web-resource-map";
import { ConfirmLogic } from "../client/src/logic/page/ConfirmLogic";
import { mountPreviewCatalog } from "./catalog-shell";
import { findSpecimen } from "../client/src/ui-uniflex/modules/preview/ComponentSpecimen/specimens";
import { declarePsdOwnership, stampPsdIdentities } from "./psd-ownership";
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
type SpecimenSkin = "classic" | "midnight";
function specimenSkin(value: string | null): SpecimenSkin {
    return value === "midnight" ? "midnight" : "classic";
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

if (catalogMode) {
    document.body.classList.add("is-catalog");
    mountPreviewCatalog(screenCatalog.screens);
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
/** Preview-only: MainNav has no ScreenFooter; wheel temporarily returns to the catalog. */
function onPreviewMainNav(slot: string, label: string, back: () => void = backToPreview): void {
    console.info(label, slot);
    if (slot === "wheel") back();
}
window.addEventListener("pagehide", dispose, { once: true });

async function startScreen(entry: ScreenEntry): Promise<void> {
    document.title = `UniFlex ${entry.componentName}`;
    switch (entry.id) {
        case "component-gallery":
            await runtime.start(ComponentGallery, { onBack: backToPreview });
            return;
        case "component-specimen": {
            const mountRuntime = (target: UniFlexWebRuntime, next: SpecimenSkin) => target.start(ComponentSpecimen, {
                part: specimen?.id ?? "",
                skin: next,
                width: entry.canvas.width,
                height: entry.canvas.height,
            });
            let activeSkin = specimenSkin(params.get("skin"));
            let swapping = false;
            let pending: SpecimenSkin | null = null;
            if (params.get("embed") === "1") {
                window.addEventListener("message", (event) => {
                    if (stopped || event.origin !== location.origin) return;
                    const data = event.data as { type?: string; skin?: string } | null;
                    if (!data || data.type !== "uniflex-preview-skin" || typeof data.skin !== "string") return;
                    const next = specimenSkin(data.skin);
                    pending = next;
                    if (swapping) return;
                    swapping = true;
                    void (async () => {
                        try {
                            while (pending && pending !== activeSkin && !stopped) {
                                const chosen = pending;
                                pending = null;
                                const previous = runtime;
                                const nextRuntime = createPreviewRuntime();
                                try {
                                    await mountRuntime(nextRuntime, chosen);
                                } catch (error) {
                                    console.error(error);
                                    continue;
                                }
                                if (stopped) {
                                    nextRuntime.dispose();
                                    return;
                                }
                                previous.dispose();
                                runtime = nextRuntime;
                                activeSkin = chosen;
                            }
                        } finally {
                            swapping = false;
                        }
                    })();
                });
            }
            await mountRuntime(runtime, activeSkin);
            if (params.get("embed") === "1" && window.parent !== window) {
                window.parent.postMessage({ type: "uniflex-preview-ready" }, location.origin);
            }
            return;
        }
        case "preview-home":
            await runtime.start(PreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "restored-home":
            await runtime.start(RestoredPreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "preview-home-restored":
            await runtime.start(PreviewHomeRestored, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "prompt":
            await runtime.start(Prompt, {
                theme: { messageColor: "#3f3254" },
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
            await runtime.start(MailBattleReportRestored, {
                onBack: backToRestored,
                onDeleteRead: () => console.info("[UniFlex MailBattleReportRestored] delete-read"),
                onConfirm: () => console.info("[UniFlex MailBattleReportRestored] confirm"),
            });
            return;
        }
        case "backpack-restored": {
            const onAction = (action: BackpackRestoredAction) => {
                console.info("[UniFlex BackpackRestored] action", action);
                if (action.action === "back" || action.action === "close") backToRestored();
            };
            await runtime.start(BackpackRestored, { onAction });
            return;
        }
        case "backpack-edited": {
            const onAction = (action: BackpackEditedRestoredAction) => {
                console.info("[UniFlex BackpackEditedRestored] action", action);
                if (action.action === "back" || action.action === "close") backToRestored();
            };
            await runtime.start(BackpackEditedRestored, { onAction });
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
        case "hero":
            await runtime.start(HeroScreen, {
                onRecruit: () => console.info("[UniFlex HeroScreen] recruit"),
                onSelectCard: () => { location.href = "?ui=hero-detail"; },
                onSelectBond: (id) => console.info("[UniFlex HeroScreen] bond", id),
                onBondDetail: (id) => console.info("[UniFlex HeroScreen] bond-detail", id),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex HeroScreen] nav"),
            });
            return;
        case "hero-detail":
            await runtime.start(HeroDetail, {
                onBack: backToPreview,
                onPrev: () => console.info("[UniFlex HeroDetail] prev"),
                onNext: () => console.info("[UniFlex HeroDetail] next"),
                onStarUp: () => console.info("[UniFlex HeroDetail] star-up"),
                onConfirmStarUpgrade: () => console.info("[UniFlex HeroDetail] confirm-star-upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroDetail] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroDetail] exchange"),
                onUpgrade: () => console.info("[UniFlex HeroDetail] upgrade"),
                onSelectSkill: (id) => console.info("[UniFlex HeroDetail] skill", id),
            });
            return;
        case "hero-star-upgrade":
            await runtime.start(HeroStarUpgrade, {
                onClose: backToPreview,
                onUpgrade: () => console.info("[UniFlex HeroStarUpgrade] upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroStarUpgrade] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroStarUpgrade] exchange"),
            });
            return;
        case "alliance":
            await runtime.start(Alliance, {
                onAction: (id) => console.info("[UniFlex Alliance] action", id),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex Alliance] nav"),
                onSelectTab: (tab) => console.info("[UniFlex Alliance] tab", tab),
            });
            return;
        case "alliance-announce":
            await runtime.start(AllianceAnnounce, {
                onClose: backToPreview,
            });
            return;
        case "alliance-create":
            await runtime.start(AllianceCreate, {
                onClose: backToPreview,
                onCreate: () => console.info("[UniFlex AllianceCreate] create"),
                onChangeBanner: () => console.info("[UniFlex AllianceCreate] change-banner"),
            });
            return;
        case "alliance-join":
            await runtime.start(AllianceJoin, {
                onBack: backToPreview,
                onSearch: (query) => console.info("[UniFlex AllianceJoin] search", query),
                onCreate: () => console.info("[UniFlex AllianceJoin] create"),
                onJoin: (id) => console.info("[UniFlex AllianceJoin] join", id),
                onAction: (id) => console.info("[UniFlex AllianceJoin] action", id),
            });
            return;
        case "alliance-member-settings":
            await runtime.start(AllianceMemberSettings, {
                onClose: backToPreview,
                onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettings] r2", enabled),
                onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettings] r3", enabled),
            });
            return;
        case "alliance-war":
            await runtime.start(AllianceWar, {
                onBack: backToPreview,
                onAction: (id) => console.info("[UniFlex AllianceWar] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceWar] tab", tab),
            });
            return;
        case "alliance-territory":
            await runtime.start(AllianceTerritory, {
                onBack: backToPreview,
                onAction: (id) => console.info("[UniFlex AllianceTerritory] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceTerritory] tab", tab),
            });
            return;
        case "alliance-march-boost":
            await runtime.start(AllianceMarchBoost, {
                onClose: backToPreview,
                onPayGem: () => console.info("[UniFlex AllianceMarchBoost] pay-gem"),
                onPayCoin: () => console.info("[UniFlex AllianceMarchBoost] pay-coin"),
            });
            return;
        case "alliance-invite":
            await runtime.start(AllianceInvite, {
                onClose: backToPreview,
                onSearch: (query) => console.info("[UniFlex AllianceInvite] search", query),
                onInvite: () => console.info("[UniFlex AllianceInvite] invite"),
                onPublicInvite: () => console.info("[UniFlex AllianceInvite] public"),
            });
            return;
        case "alliance-gift":
            await runtime.start(AllianceGift, {
                onBack: backToPreview,
                onClaimAll: () => console.info("[UniFlex AllianceGift] claim-all"),
                onAction: (id) => console.info("[UniFlex AllianceGift] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceGift] tab", tab),
            });
            return;
        case "alliance-help":
            await runtime.start(AllianceHelp, {
                onClose: backToPreview,
                onCreate: () => console.info("[UniFlex AllianceHelp] create"),
                onAction: (id) => console.info("[UniFlex AllianceHelp] action", id),
            });
            return;
        case "alliance-board":
            await runtime.start(AllianceBoard, {
                onBack: backToPreview,
                onSend: (text) => console.info("[UniFlex AllianceBoard] send", text),
                onAction: (id) => console.info("[UniFlex AllianceBoard] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceBoard] tab", tab),
            });
            return;
        case "alliance-tech":
            await runtime.start(AllianceTech, {
                onBack: backToPreview,
                onAction: (id) => console.info("[UniFlex AllianceTech] action", id),
            });
            return;
        case "shop-getitem":
            await runtime.start(ShopGetItem, {
                onClose: backToPreview,
                onChange: (quantity) => console.info("[UniFlex ShopGetItem] quantity", quantity),
                onBuy: (quantity) => console.info("[UniFlex ShopGetItem] buy", quantity),
            });
            return;
        case "shop":
            await runtime.start(Shop, {
                onBack: backToPreview,
                onAction: (id) => console.info("[UniFlex Shop] action", id),
            });
            return;
        case "prompt-restored":
            await runtime.start(PromptRestored, {
                theme: { messageColor: "#3f3254" },
                title: "创建角色",
                message: "在该服务器创建1名新角色?",
                confirmText: "确定",
                cancelText: "取消",
                onConfirm: () => console.info("[UniFlex PromptRestored] result=true"),
                onCancel: backToRestored,
                onClose: backToRestored,
            });
            return;
        case "confirm-restored": {
            const logic = new ConfirmLogic({
                title: "UniFlex Confirm",
                content: "这是 UniFlex 在 gameStarterKit 中的本地运行预览。",
                noText: params.get("cancel") === "0" ? null : "取消",
                onYes: () => console.info("[UniFlex ConfirmRestored] result=true"),
                onNo: () => console.info("[UniFlex ConfirmRestored] result=false"),
            });
            logic.onClose = dispose;
            await runtime.start(ConfirmRestored, { logic, isActive: () => !stopped });
            return;
        }
        case "small-popup-restored":
            await runtime.start(SmallPopupRestored, { title: "标题", onClose: backToRestored });
            return;
        case "settings-restored":
            await runtime.start(SettingsRestored, {
                onClose: backToRestored,
                onSelect: (id) => console.info("[UniFlex SettingsRestored] select", id),
            });
            return;
        case "character-restored":
            await runtime.start(CharacterManageRestored, {
                onClose: backToRestored,
                onSelectPlayer: (id) => console.info("[UniFlex CharacterManageRestored] player", id),
                onSelectServer: (id) => console.info("[UniFlex CharacterManageRestored] server", id),
            });
            return;
        case "hero-restored":
            await runtime.start(HeroScreenRestored, {
                onRecruit: () => console.info("[UniFlex HeroScreenRestored] recruit"),
                onSelectCard: (_id) => { location.href = "?ui=hero-detail-restored"; },
                onSelectBond: (id) => console.info("[UniFlex HeroScreenRestored] bond", id),
                onBondDetail: (id) => console.info("[UniFlex HeroScreenRestored] bond-detail", id),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex HeroScreenRestored] nav", backToRestored),
            });
            return;
        case "hero-detail-restored":
            await runtime.start(HeroDetailRestored, {
                onBack: backToRestored,
                onPrev: () => console.info("[UniFlex HeroDetailRestored] prev"),
                onNext: () => console.info("[UniFlex HeroDetailRestored] next"),
                onStarUp: () => console.info("[UniFlex HeroDetailRestored] star-up"),
                onConfirmStarUpgrade: () => console.info("[UniFlex HeroDetailRestored] confirm-star-upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroDetailRestored] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroDetailRestored] exchange"),
                onUpgrade: () => console.info("[UniFlex HeroDetailRestored] upgrade"),
                onSelectSkill: (id) => console.info("[UniFlex HeroDetailRestored] skill", id),
            });
            return;
        case "hero-star-upgrade-restored":
            await runtime.start(HeroStarUpgradeRestored, {
                onClose: backToRestored,
                onUpgrade: () => console.info("[UniFlex HeroStarUpgradeRestored] upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroStarUpgradeRestored] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroStarUpgradeRestored] exchange"),
            });
            return;
        case "alliance-restored":
            await runtime.start(AllianceRestored, {
                onAction: (id) => console.info("[UniFlex AllianceRestored] action", id),
                onNav: (slot) => console.info("[UniFlex AllianceRestored] nav", slot),
                onSelectTab: (tab) => console.info("[UniFlex AllianceRestored] tab", tab),
            });
            return;
        case "alliance-announce-restored":
            await runtime.start(AllianceAnnounceRestored, {
                onClose: backToRestored,
            });
            return;
        case "alliance-create-restored":
            await runtime.start(AllianceCreateRestored, {
                onClose: backToRestored,
                onCreate: () => console.info("[UniFlex AllianceCreateRestored] create"),
                onChangeBanner: () => console.info("[UniFlex AllianceCreateRestored] change-banner"),
            });
            return;
        case "alliance-join-restored":
            await runtime.start(AllianceJoinRestored, {
                onBack: backToRestored,
                onSearch: (query) => console.info("[UniFlex AllianceJoinRestored] search", query),
                onCreate: () => console.info("[UniFlex AllianceJoinRestored] create"),
                onJoin: (id) => console.info("[UniFlex AllianceJoinRestored] join", id),
                onAction: (id) => console.info("[UniFlex AllianceJoinRestored] action", id),
            });
            return;
        case "alliance-member-settings-restored":
            await runtime.start(AllianceMemberSettingsRestored, {
                onClose: backToRestored,
                onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettingsRestored] r2", enabled),
                onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettingsRestored] r3", enabled),
            });
            return;
        case "alliance-war-restored":
            await runtime.start(AllianceWarRestored, {
                onBack: backToRestored,
                onAction: (id) => console.info("[UniFlex AllianceWarRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceWarRestored] tab", tab),
            });
            return;
        case "alliance-territory-restored":
            await runtime.start(AllianceTerritoryRestored, {
                onBack: backToRestored,
                onAction: (id) => console.info("[UniFlex AllianceTerritoryRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceTerritoryRestored] tab", tab),
            });
            return;
        case "alliance-march-boost-restored":
            await runtime.start(AllianceMarchBoostRestored, {
                onClose: backToRestored,
                onPayGem: () => console.info("[UniFlex AllianceMarchBoostRestored] pay-gem"),
                onPayCoin: () => console.info("[UniFlex AllianceMarchBoostRestored] pay-coin"),
            });
            return;
        case "alliance-invite-restored":
            await runtime.start(AllianceInviteRestored, {
                onClose: backToRestored,
                onSearch: (query) => console.info("[UniFlex AllianceInviteRestored] search", query),
                onInvite: () => console.info("[UniFlex AllianceInviteRestored] invite"),
                onPublicInvite: () => console.info("[UniFlex AllianceInviteRestored] public"),
            });
            return;
        case "alliance-gift-restored":
            await runtime.start(AllianceGiftRestored, {
                onBack: backToRestored,
                onClaimAll: () => console.info("[UniFlex AllianceGiftRestored] claim-all"),
                onAction: (id) => console.info("[UniFlex AllianceGiftRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceGiftRestored] tab", tab),
            });
            return;
        case "alliance-help-restored":
            await runtime.start(AllianceHelpRestored, {
                onClose: backToRestored,
                onCreate: () => console.info("[UniFlex AllianceHelpRestored] create"),
                onAction: (id) => console.info("[UniFlex AllianceHelpRestored] action", id),
            });
            return;
        case "alliance-board-restored":
            await runtime.start(AllianceBoardRestored, {
                onBack: backToRestored,
                onSend: (text) => console.info("[UniFlex AllianceBoardRestored] send", text),
                onAction: (id) => console.info("[UniFlex AllianceBoardRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceBoardRestored] tab", tab),
            });
            return;
        case "alliance-tech-restored":
            await runtime.start(AllianceTechRestored, {
                onBack: backToRestored,
                onAction: (id) => console.info("[UniFlex AllianceTechRestored] action", id),
            });
            return;
        case "shop-getitem-restored":
            await runtime.start(ShopGetItemRestored, {
                onClose: backToRestored,
                onChange: (quantity) => console.info("[UniFlex ShopGetItemRestored] quantity", quantity),
                onBuy: (quantity) => console.info("[UniFlex ShopGetItemRestored] buy", quantity),
            });
            return;
        default:
            throw new Error(`No UniFlex preview starter for screen: ${entry.id}`);
    }
}

try {
    await startScreen(active);
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
