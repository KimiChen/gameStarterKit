import { UniFlexWebRuntime } from "../client/src/kits/uniflex/api/web/index";
import { Alliance, AllianceAnnounce, AllianceAnnounceRestored, AllianceBoard, AllianceBoardRestored, AllianceCreate, AllianceCreateRestored, AllianceGift, AllianceGiftRestored, AllianceHelp, AllianceHelpRestored, AllianceInvite, AllianceInviteRestored, AllianceJoin, AllianceJoinRestored, AllianceMarchBoost, AllianceMarchBoostRestored, AllianceMemberSettings, AllianceMemberSettingsRestored, AllianceRestored, AllianceTech, AllianceTechRestored, AllianceTerritory, AllianceTerritoryRestored, AllianceWar, AllianceWarRestored, Backpack, BackpackEditedRestored, BackpackRestored, CharacterManage, CharacterManageRestored, ComponentGallery, ComponentSpecimen, Confirm, ConfirmRestored, HeroDetail, HeroDetailRestored, HeroScreen, HeroScreenRestored, HeroStarUpgrade, HeroStarUpgradeRestored, Mail, MailSoldierDetails, MailTroopDetails, MailBattleLog, MailReportDetail, MailBattleReport, MailBattleReportRestored, PreviewHome, PreviewHomeRestored, RestoredPreviewHome, Settings, SettingsRestored, RewardObtain, Victory, Defeat, Shop, ShopGetItem, ShopGetItemRestored, SmallPopup, SmallPopupRestored } from "../client/src/ui-uniflex/generated/ui";
import type { BackpackAction } from "../client/src/ui-uniflex/generated/Backpack";
import type { BackpackEditedRestoredAction } from "../client/src/ui-uniflex/generated/BackpackEditedRestored";
import type { BackpackRestoredAction } from "../client/src/ui-uniflex/generated/BackpackRestored";
import type { MailBattleReportParams } from "../client/src/ui-uniflex/generated/MailBattleReport";
import type { ScreenEntry } from "./screens";
import { themes } from "../client/src/ui-uniflex/themes/active";

const previewParams = new URLSearchParams(location.search);

function previewStars(fallback: number): number {
    const raw = previewParams.get("stars");
    if (raw == null || raw === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(25, Math.floor(value))) : fallback;
}

export type SpecimenSkin = "classic" | "midnight";
export type PreviewSkinName = SpecimenSkin | "restored";

export function previewSkin(value: string | null): PreviewSkinName {
    if (value === "midnight" || value === "restored") return value;
    return "classic";
}

export function specimenSkin(value: string | null): SpecimenSkin {
    return value === "midnight" ? "midnight" : "classic";
}

/** 一张预览的运行时。目录卡片和单独打开的页面共用同一套启动逻辑。 */
export interface PreviewSession {
    runtime: UniFlexWebRuntime;
    recreate(): UniFlexWebRuntime;
    back(): void;
    restored(): void;
    stopped(): boolean;
    dispose(): void;
    part: string;
    skin: PreviewSkinName;
    embedSkin: boolean;
    setTitle: boolean;
}

/** Preview-only: MainNav has no ScreenFooter; wheel temporarily returns to the catalog. */
function onPreviewMainNav(slot: string, label: string, back: () => void): void {
    console.info(label, slot);
    if (slot === "wheel") back();
}

export async function startPreview(session: PreviewSession, entry: ScreenEntry): Promise<void> {
    if (session.setTitle) document.title = `UniFlex ${entry.componentName}`;
    switch (entry.id) {
        case "component-gallery":
            await session.runtime.start(ComponentGallery, { onBack: session.back });
            return;
        case "component-specimen": {
            const mountRuntime = (target: UniFlexWebRuntime, next: SpecimenSkin) => target.start(ComponentSpecimen, {
                part: session.part,
                skin: next,
                width: entry.canvas.width,
                height: entry.canvas.height,
            });
            let activeSkin = specimenSkin(session.skin);
            let swapping = false;
            let pending: SpecimenSkin | null = null;
            if (session.embedSkin) {
                window.addEventListener("message", (event) => {
                    if (session.stopped() || event.origin !== location.origin) return;
                    const data = event.data as { type?: string; skin?: string } | null;
                    if (!data || data.type !== "uniflex-preview-skin" || typeof data.skin !== "string") return;
                    const next = specimenSkin(data.skin);
                    pending = next;
                    if (swapping) return;
                    swapping = true;
                    void (async () => {
                        try {
                            while (pending && pending !== activeSkin && !session.stopped()) {
                                const chosen = pending;
                                pending = null;
                                session.runtime.dispose();
                                session.runtime = session.recreate();
                                try {
                                    await mountRuntime(session.runtime, chosen);
                                } catch (error) {
                                    console.error(error);
                                    if (session.stopped()) return;
                                    session.runtime = session.recreate();
                                    await mountRuntime(session.runtime, chosen);
                                }
                                activeSkin = chosen;
                            }
                        } finally {
                            swapping = false;
                        }
                    })();
                });
            }
            await mountRuntime(session.runtime, activeSkin);
            if (session.embedSkin && window.parent !== window) {
                window.parent.postMessage({ type: "uniflex-preview-ready" }, location.origin);
            }
            return;
        }
        case "preview-home":
            await session.runtime.start(PreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "restored-home":
            await session.runtime.start(RestoredPreviewHome, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "preview-home-restored":
            await session.runtime.start(PreviewHomeRestored, { onNavigate: (target) => { location.href = `?ui=${target}`; } });
            return;
        case "small-popup":
            await session.runtime.start(SmallPopup, { title: "标题", onClose: session.back });
            return;
        case "confirm":
            await session.runtime.start(Confirm, {
                theme: { messageColor: "#3f3254" },
                title: "创建角色",
                message: "在该服务器创建1名新角色?",
                confirmText: "确定",
                cancelText: previewParams.get("cancel") === "0" ? null : "取消",
                onConfirm: () => console.info("[UniFlex Confirm] result=true"),
                onCancel: session.back,
                onClose: session.back,
            });
            return;
        case "backpack": {
            const onAction = (action: BackpackAction) => {
                console.info("[UniFlex Backpack] action", action);
                if (action.action === "back" || action.action === "close") session.back();
            };
            await session.runtime.start(Backpack, { onAction });
            return;
        }
        case "mail-soldier-details":
            await session.runtime.start(MailSoldierDetails, {
                onClose: session.back,
                onAction: (action) => console.info("[UniFlex MailSoldierDetails] action", action),
            });
            return;
        case "mail-troop-details":
            await session.runtime.start(MailTroopDetails, {
                onClose: session.back,
                onAction: (action) => console.info("[UniFlex MailTroopDetails] action", action),
            });
            return;
        case "mail-battle-log":
            await session.runtime.start(MailBattleLog, {
                onClose: session.back,
                onAction: (action) => console.info("[UniFlex MailBattleLog] action", action),
            });
            return;
        case "mail-report-detail":
            await session.runtime.start(MailReportDetail, {
                onClose: session.back,
                onAction: (action) => console.info("[UniFlex MailReportDetail] action", action),
            });
            return;
        case "mail-popup":
            await session.runtime.start(Mail, {
                onClose: session.back,
                onAction: (action) => console.info("[UniFlex Mail] action", action),
                onSelectTab: (tab) => console.info("[UniFlex Mail] tab", tab),
            });
            return;
        case "mail": {
            const mailParams: MailBattleReportParams = {
                onBack: session.back,
                onDeleteRead: () => console.info("[UniFlex MailBattleReport] delete-read"),
                onConfirm: () => console.info("[UniFlex MailBattleReport] confirm"),
            };
            await session.runtime.start(MailBattleReport, mailParams);
            return;
        }
        case "mail-restored": {
            await session.runtime.start(MailBattleReportRestored, {
                onBack: session.restored,
                onDeleteRead: () => console.info("[UniFlex MailBattleReportRestored] delete-read"),
                onConfirm: () => console.info("[UniFlex MailBattleReportRestored] confirm"),
            });
            return;
        }
        case "backpack-restored": {
            const onAction = (action: BackpackRestoredAction) => {
                console.info("[UniFlex BackpackRestored] action", action);
                if (action.action === "back" || action.action === "close") session.restored();
            };
            await session.runtime.start(BackpackRestored, { onAction });
            return;
        }
        case "backpack-edited": {
            const onAction = (action: BackpackEditedRestoredAction) => {
                console.info("[UniFlex BackpackEditedRestored] action", action);
                if (action.action === "back" || action.action === "close") session.restored();
            };
            await session.runtime.start(BackpackEditedRestored, { onAction });
            return;
        }
        case "settings": {
            const theme = session.skin === "restored" ? themes.restored
                : session.skin === "midnight" ? themes.midnight : themes.classic;
            await session.runtime.start(Settings, {
                theme,
                onClose: session.back,
                onSelect: (id) => console.info("[UniFlex Settings] select", id),
            });
            return;
        }
        case "character":
            await session.runtime.start(CharacterManage, {
                onClose: session.back,
                onSelectPlayer: (id) => console.info("[UniFlex CharacterManage] player", id),
                onSelectServer: (id) => console.info("[UniFlex CharacterManage] server", id),
            });
            return;
        case "hero":
            await session.runtime.start(HeroScreen, {
                onRecruit: () => console.info("[UniFlex HeroScreen] recruit"),
                onSelectCard: (_id, stars) => {
                    location.href = `?ui=hero-detail&stars=${stars ?? 0}`;
                },
                onSelectBond: (id) => console.info("[UniFlex HeroScreen] bond", id),
                onBondDetail: (id) => console.info("[UniFlex HeroScreen] bond-detail", id),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex HeroScreen] nav", session.back),
            });
            return;
        case "hero-detail":
            await session.runtime.start(HeroDetail, {
                stars: previewStars(6),
                onBack: session.back,
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
            await session.runtime.start(HeroStarUpgrade, {
                stars: previewStars(6),
                onClose: session.back,
                onUpgrade: () => console.info("[UniFlex HeroStarUpgrade] upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroStarUpgrade] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroStarUpgrade] exchange"),
            });
            return;
        case "alliance":
            await session.runtime.start(Alliance, {
                onAction: (id) => console.info("[UniFlex Alliance] action", id),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex Alliance] nav", session.back),
                onSelectTab: (tab) => console.info("[UniFlex Alliance] tab", tab),
            });
            return;
        case "alliance-announce":
            await session.runtime.start(AllianceAnnounce, {
                onClose: session.back,
            });
            return;
        case "alliance-create":
            await session.runtime.start(AllianceCreate, {
                onClose: session.back,
                onCreate: () => console.info("[UniFlex AllianceCreate] create"),
                onChangeBanner: () => console.info("[UniFlex AllianceCreate] change-banner"),
            });
            return;
        case "alliance-join":
            await session.runtime.start(AllianceJoin, {
                onBack: session.back,
                onSearch: (query) => console.info("[UniFlex AllianceJoin] search", query),
                onCreate: () => console.info("[UniFlex AllianceJoin] create"),
                onJoin: (id) => console.info("[UniFlex AllianceJoin] join", id),
                onAction: (id) => console.info("[UniFlex AllianceJoin] action", id),
            });
            return;
        case "alliance-member-settings":
            await session.runtime.start(AllianceMemberSettings, {
                onClose: session.back,
                onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettings] r2", enabled),
                onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettings] r3", enabled),
            });
            return;
        case "alliance-war":
            await session.runtime.start(AllianceWar, {
                onBack: session.back,
                onAction: (id) => console.info("[UniFlex AllianceWar] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceWar] tab", tab),
            });
            return;
        case "alliance-territory":
            await session.runtime.start(AllianceTerritory, {
                onBack: session.back,
                onAction: (id) => console.info("[UniFlex AllianceTerritory] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceTerritory] tab", tab),
            });
            return;
        case "alliance-march-boost":
            await session.runtime.start(AllianceMarchBoost, {
                onClose: session.back,
                onPayGem: () => console.info("[UniFlex AllianceMarchBoost] pay-gem"),
                onPayCoin: () => console.info("[UniFlex AllianceMarchBoost] pay-coin"),
            });
            return;
        case "alliance-invite":
            await session.runtime.start(AllianceInvite, {
                onClose: session.back,
                onSearch: (query) => console.info("[UniFlex AllianceInvite] search", query),
                onInvite: () => console.info("[UniFlex AllianceInvite] invite"),
                onPublicInvite: () => console.info("[UniFlex AllianceInvite] public"),
            });
            return;
        case "alliance-gift":
            await session.runtime.start(AllianceGift, {
                onBack: session.back,
                onClaimAll: () => console.info("[UniFlex AllianceGift] claim-all"),
                onAction: (id) => console.info("[UniFlex AllianceGift] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceGift] tab", tab),
            });
            return;
        case "alliance-help":
            await session.runtime.start(AllianceHelp, {
                onClose: session.back,
                onCreate: () => console.info("[UniFlex AllianceHelp] create"),
                onAction: (id) => console.info("[UniFlex AllianceHelp] action", id),
            });
            return;
        case "alliance-board":
            await session.runtime.start(AllianceBoard, {
                onBack: session.back,
                onSend: (text) => console.info("[UniFlex AllianceBoard] send", text),
                onAction: (id) => console.info("[UniFlex AllianceBoard] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceBoard] tab", tab),
            });
            return;
        case "alliance-tech":
            await session.runtime.start(AllianceTech, {
                onBack: session.back,
                onAction: (id) => console.info("[UniFlex AllianceTech] action", id),
            });
            return;
        case "shop-getitem":
            await session.runtime.start(ShopGetItem, {
                onClose: session.back,
                onChange: (quantity) => console.info("[UniFlex ShopGetItem] quantity", quantity),
                onBuy: (quantity) => console.info("[UniFlex ShopGetItem] buy", quantity),
            });
            return;
        case "shop":
            await session.runtime.start(Shop, {
                onBack: session.back,
                onAction: (id) => console.info("[UniFlex Shop] action", id),
            });
            return;
        case "reward-obtain":
            await session.runtime.start(RewardObtain, {
                onClose: () => {
                    console.info("[UniFlex RewardObtain] close");
                    session.back();
                },
            });
            return;
        case "victory":
            await session.runtime.start(Victory, {
                onClose: () => {
                    console.info("[UniFlex Victory] close");
                    session.back();
                },
            });
            return;
        case "defeat":
            await session.runtime.start(Defeat, {
                onClose: () => {
                    console.info("[UniFlex Defeat] close");
                    session.back();
                },
                onWay: (id) => console.info("[UniFlex Defeat] way", id),
            });
            return;
        case "confirm-restored":
            await session.runtime.start(ConfirmRestored, {
                theme: { messageColor: "#3f3254" },
                title: "创建角色",
                message: "在该服务器创建1名新角色?",
                confirmText: "确定",
                cancelText: previewParams.get("cancel") === "0" ? null : "取消",
                onConfirm: () => console.info("[UniFlex ConfirmRestored] result=true"),
                onCancel: session.restored,
                onClose: session.restored,
            });
            return;
        case "small-popup-restored":
            await session.runtime.start(SmallPopupRestored, { title: "标题", onClose: session.restored });
            return;
        case "settings-restored":
            await session.runtime.start(SettingsRestored, {
                onClose: session.restored,
                onSelect: (id) => console.info("[UniFlex SettingsRestored] select", id),
            });
            return;
        case "character-restored":
            await session.runtime.start(CharacterManageRestored, {
                onClose: session.restored,
                onSelectPlayer: (id) => console.info("[UniFlex CharacterManageRestored] player", id),
                onSelectServer: (id) => console.info("[UniFlex CharacterManageRestored] server", id),
            });
            return;
        case "hero-restored":
            await session.runtime.start(HeroScreenRestored, {
                onRecruit: () => console.info("[UniFlex HeroScreenRestored] recruit"),
                onSelectCard: (_id) => { location.href = "?ui=hero-detail-restored"; },
                onSelectBond: (id) => console.info("[UniFlex HeroScreenRestored] bond", id),
                onBondDetail: (id) => console.info("[UniFlex HeroScreenRestored] bond-detail", id),
                onNav: (slot) => onPreviewMainNav(slot, "[UniFlex HeroScreenRestored] nav", session.restored),
            });
            return;
        case "hero-detail-restored":
            await session.runtime.start(HeroDetailRestored, {
                onBack: session.restored,
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
            await session.runtime.start(HeroStarUpgradeRestored, {
                onClose: session.restored,
                onUpgrade: () => console.info("[UniFlex HeroStarUpgradeRestored] upgrade"),
                onObtainFragments: () => console.info("[UniFlex HeroStarUpgradeRestored] obtain-fragments"),
                onExchange: () => console.info("[UniFlex HeroStarUpgradeRestored] exchange"),
            });
            return;
        case "alliance-restored":
            await session.runtime.start(AllianceRestored, {
                onAction: (id) => console.info("[UniFlex AllianceRestored] action", id),
                onNav: (slot) => console.info("[UniFlex AllianceRestored] nav", slot),
                onSelectTab: (tab) => console.info("[UniFlex AllianceRestored] tab", tab),
            });
            return;
        case "alliance-announce-restored":
            await session.runtime.start(AllianceAnnounceRestored, {
                onClose: session.restored,
            });
            return;
        case "alliance-create-restored":
            await session.runtime.start(AllianceCreateRestored, {
                onClose: session.restored,
                onCreate: () => console.info("[UniFlex AllianceCreateRestored] create"),
                onChangeBanner: () => console.info("[UniFlex AllianceCreateRestored] change-banner"),
            });
            return;
        case "alliance-join-restored":
            await session.runtime.start(AllianceJoinRestored, {
                onBack: session.restored,
                onSearch: (query) => console.info("[UniFlex AllianceJoinRestored] search", query),
                onCreate: () => console.info("[UniFlex AllianceJoinRestored] create"),
                onJoin: (id) => console.info("[UniFlex AllianceJoinRestored] join", id),
                onAction: (id) => console.info("[UniFlex AllianceJoinRestored] action", id),
            });
            return;
        case "alliance-member-settings-restored":
            await session.runtime.start(AllianceMemberSettingsRestored, {
                onClose: session.restored,
                onToggleR2: (enabled) => console.info("[UniFlex AllianceMemberSettingsRestored] r2", enabled),
                onToggleR3: (enabled) => console.info("[UniFlex AllianceMemberSettingsRestored] r3", enabled),
            });
            return;
        case "alliance-war-restored":
            await session.runtime.start(AllianceWarRestored, {
                onBack: session.restored,
                onAction: (id) => console.info("[UniFlex AllianceWarRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceWarRestored] tab", tab),
            });
            return;
        case "alliance-territory-restored":
            await session.runtime.start(AllianceTerritoryRestored, {
                onBack: session.restored,
                onAction: (id) => console.info("[UniFlex AllianceTerritoryRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceTerritoryRestored] tab", tab),
            });
            return;
        case "alliance-march-boost-restored":
            await session.runtime.start(AllianceMarchBoostRestored, {
                onClose: session.restored,
                onPayGem: () => console.info("[UniFlex AllianceMarchBoostRestored] pay-gem"),
                onPayCoin: () => console.info("[UniFlex AllianceMarchBoostRestored] pay-coin"),
            });
            return;
        case "alliance-invite-restored":
            await session.runtime.start(AllianceInviteRestored, {
                onClose: session.restored,
                onSearch: (query) => console.info("[UniFlex AllianceInviteRestored] search", query),
                onInvite: () => console.info("[UniFlex AllianceInviteRestored] invite"),
                onPublicInvite: () => console.info("[UniFlex AllianceInviteRestored] public"),
            });
            return;
        case "alliance-gift-restored":
            await session.runtime.start(AllianceGiftRestored, {
                onBack: session.restored,
                onClaimAll: () => console.info("[UniFlex AllianceGiftRestored] claim-all"),
                onAction: (id) => console.info("[UniFlex AllianceGiftRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceGiftRestored] tab", tab),
            });
            return;
        case "alliance-help-restored":
            await session.runtime.start(AllianceHelpRestored, {
                onClose: session.restored,
                onCreate: () => console.info("[UniFlex AllianceHelpRestored] create"),
                onAction: (id) => console.info("[UniFlex AllianceHelpRestored] action", id),
            });
            return;
        case "alliance-board-restored":
            await session.runtime.start(AllianceBoardRestored, {
                onBack: session.restored,
                onSend: (text) => console.info("[UniFlex AllianceBoardRestored] send", text),
                onAction: (id) => console.info("[UniFlex AllianceBoardRestored] action", id),
                onSelectTab: (tab) => console.info("[UniFlex AllianceBoardRestored] tab", tab),
            });
            return;
        case "alliance-tech-restored":
            await session.runtime.start(AllianceTechRestored, {
                onBack: session.restored,
                onAction: (id) => console.info("[UniFlex AllianceTechRestored] action", id),
            });
            return;
        case "shop-getitem-restored":
            await session.runtime.start(ShopGetItemRestored, {
                onClose: session.restored,
                onChange: (quantity) => console.info("[UniFlex ShopGetItemRestored] quantity", quantity),
                onBuy: (quantity) => console.info("[UniFlex ShopGetItemRestored] buy", quantity),
            });
            return;
        default:
            throw new Error(`No UniFlex preview starter for screen: ${entry.id}`);
    }
}
