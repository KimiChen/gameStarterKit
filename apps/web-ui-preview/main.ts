import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Alliance, AllianceAnnounce, AllianceBoard, AllianceCreate, AllianceGift, AllianceHelp, AllianceInvite, AllianceJoin, AllianceMarchBoost, AllianceMemberSettings, AllianceTerritory, AllianceWar, Backpack, BackpackEditedRestored, BackpackRestored, CharacterManage, CharacterManageRestored, Confirm, ConfirmRestored, HeroDetail, HeroDetailRestored, HeroScreen, HeroScreenRestored, HeroStarUpgrade, MailBattleReport, MailBattleReportRestored, PreviewHome, PreviewHomeRestored, Prompt, PromptRestored, RestoredPreviewHome, Settings, SettingsRestored, SmallPopup, SmallPopupRestored, loadGameUI } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import type { BackpackEditedRestoredAction } from "../client/src/ui-uniflex/generated/BackpackEditedRestored";
import type { BackpackRestoredAction } from "../client/src/ui-uniflex/generated/BackpackRestored";
import type { MailBattleReportParams } from "../client/src/ui-uniflex/generated/MailBattleReport";
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
function backToRestored() {
    location.href = "?ui=restored-home";
}
window.addEventListener("pagehide", dispose, { once: true });

async function startScreen(entry: ScreenEntry): Promise<void> {
    document.title = `UniFlex ${entry.componentName}`;
    switch (entry.id) {
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
                onNav: (slot) => console.info("[UniFlex HeroScreen] nav", slot),
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
                onNav: (slot) => console.info("[UniFlex Alliance] nav", slot),
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
        case "prompt-restored":
            await runtime.start(PromptRestored, {
                theme: { titleColor: "#ffffff", titleOutline: "#593d84", messageColor: "#3f3254" },
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
                onNav: (slot) => console.info("[UniFlex HeroScreenRestored] nav", slot),
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
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    container.textContent = `预览启动失败：${detail}`;
    container.style.color = "#ff8a80";
    container.style.whiteSpace = "pre-wrap";
    container.style.fontSize = "28px";
    container.style.padding = "40px";
    dispose();
}
