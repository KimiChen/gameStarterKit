import { componentSpecimens } from "../client/src/ui-uniflex/modules/preview/ComponentSpecimen/specimens";
import type { ScreenEntry } from "./screens";

export type PreviewLine = "original" | "restored";

const HIDDEN_SCREENS = new Set([
    "preview-home",
    "component-gallery",
    "restored-home",
    "preview-home-restored",
]);

export interface CatalogLeaf {
    readonly id: string;
    readonly label: string;
    readonly width: number;
    readonly height: number;
    readonly keys: string;
    readonly kind: "screen" | "component";
    readonly wide?: boolean;
}

export interface CatalogGroup {
    readonly id: string;
    readonly label: string;
    readonly items: readonly CatalogLeaf[];
}

export interface CatalogSection {
    readonly id: string;
    readonly label: string;
    readonly groups: readonly CatalogGroup[];
}

const MODULE_ORDER = ["preview", "popup", "backpack", "mail", "settings", "character", "hero", "alliance", "shop", "reward"];

const MODULE_LABEL: Record<string, string> = {
    preview: "目录",
    popup: "弹窗",
    backpack: "背包",
    mail: "邮件",
    settings: "设置",
    character: "角色",
    hero: "英雄",
    alliance: "联盟",
    shop: "商店",
    reward: "通用",
};

const SCREEN_LABEL: Record<string, string> = {
    "preview-home": "原稿首页",
    "component-gallery": "通用组件",
    "restored-home": "还原首页",
    "preview-home-restored": "还原首页稿",
    "small-popup": "小弹窗底板",
    confirm: "确认弹窗",
    backpack: "背包界面",
    "backpack-edited": "背包编辑稿",
    "mail-popup": "邮件",
    mail: "邮件战报",
    settings: "设置界面",
    character: "角色管理",
    hero: "英雄卡牌",
    "hero-detail": "英雄详情",
    "hero-star-upgrade": "升星弹窗",
    alliance: "联盟主页",
    "alliance-announce": "联盟公告",
    "alliance-create": "创建联盟",
    "alliance-join": "加入联盟",
    "alliance-member-settings": "成员设置",
    "alliance-war": "联盟战争",
    "alliance-territory": "领地旗帜",
    "alliance-march-boost": "行军加速",
    "alliance-invite": "邀请成员",
    "alliance-gift": "联盟礼物",
    "alliance-help": "联盟帮助",
    "alliance-board": "留言板",
    "alliance-tech": "联盟科技",
    shop: "商店",
    "shop-getitem": "获取道具",
    "reward-obtain": "恭喜获得",
    victory: "战斗胜利",
    defeat: "战斗失败",
};

export function previewLine(screen: ScreenEntry): PreviewLine {
    if (screen.id === "restored-home" || screen.id === "preview-home-restored") return "restored";
    if (screen.id.endsWith("-restored") || screen.componentName.endsWith("Restored")) return "restored";
    return "original";
}

export function previewModule(screen: ScreenEntry): string {
    return screen.source.match(/modules\/([^/]+)\//)?.[1] ?? "other";
}

export function previewLabel(screen: ScreenEntry): string {
    const named = SCREEN_LABEL[screen.id];
    if (named) return named;
    const base = screen.id.replace(/-restored$/, "");
    return SCREEN_LABEL[base] ?? screen.componentName;
}

/** 目录只列原稿。还原页仍可用 ?ui= 直开，不进侧栏和卡片。 */
export function groupPreviewScreens(screens: readonly ScreenEntry[]): readonly CatalogSection[] {
    const lines: PreviewLine[] = ["original"];
    return lines.map((line) => {
        const inLine = screens.filter((screen) => previewLine(screen) === line && !HIDDEN_SCREENS.has(screen.id));
        const modules = [...new Set(inLine.map(previewModule))];
        modules.sort((a, b) => {
            const ai = MODULE_ORDER.indexOf(a);
            const bi = MODULE_ORDER.indexOf(b);
            return (ai === -1 ? MODULE_ORDER.length : ai) - (bi === -1 ? MODULE_ORDER.length : bi) || a.localeCompare(b);
        });
        const groups = modules.map((moduleId) => ({
            id: `${line}-${moduleId}`,
            label: MODULE_LABEL[moduleId] ?? moduleId,
            items: inLine.filter((screen) => previewModule(screen) === moduleId).map((screen) => ({
                id: screen.id,
                label: previewLabel(screen),
                width: screen.canvas.width,
                height: screen.canvas.height,
                keys: [screen.id, screen.componentName, ...screen.aliases].join(" "),
                kind: "screen" as const,
            })),
        })).filter((group) => group.items.length > 0);
        return {
            id: `v-${line}`,
            label: line === "original" ? "原稿" : "还原",
            groups,
        };
    }).filter((section) => section.groups.length > 0);
}

/** 组件在前，原稿界面接在后面。首页、旧组件长页和还原页不进目录。 */
export function buildCatalog(screens: readonly ScreenEntry[]): readonly CatalogSection[] {
    const groups: CatalogGroup[] = [];
    for (const spec of componentSpecimens) {
        let group = groups.find((item) => item.id === spec.group);
        if (!group) {
            group = { id: spec.group, label: spec.groupLabel, items: [] };
            groups.push(group);
        }
        (group.items as CatalogLeaf[]).push({
            id: spec.id,
            label: spec.label,
            width: spec.width,
            height: spec.height,
            keys: `${spec.label} ${spec.id}`,
            kind: "component",
            wide: spec.wide,
        });
    }
    const components: CatalogSection = { id: "v-components", label: "组件", groups };
    return [components, ...groupPreviewScreens(screens)];
}
