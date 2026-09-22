import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { COMMON_PACKAGE } from "./constants.mjs";

/** Same tile order / sizes / colors as UniFlex PreviewHome. */
export const CATALOG_TILES = Object.freeze([
    { id: "small-popup", title: "小弹窗底板", width: 300, height: 102, background: "#7dcc63" },
    { id: "backpack", title: "背包界面", width: 300, height: 102, background: "#53657d" },
    { id: "mail", title: "邮件战报", width: 300, height: 102, background: "#72558f" },
    { id: "settings", title: "设置界面", width: 300, height: 102, background: "#596b5e" },
    { id: "character", title: "角色管理", width: 300, height: 102, background: "#7a5a9a" },
    { id: "hero", title: "英雄卡牌", width: 300, height: 90, background: "#8a4a62" },
    { id: "hero-detail", title: "英雄详情", width: 300, height: 90, background: "#c4a035" },
    { id: "hero-star-upgrade", title: "升星弹窗", width: 300, height: 72, background: "#6b4ea2" },
    { id: "alliance", title: "联盟主页", width: 300, height: 72, background: "#4a6a9a" },
    { id: "alliance-announce", title: "联盟公告", width: 300, height: 72, background: "#3d5a80" },
    { id: "alliance-create", title: "创建联盟", width: 300, height: 72, background: "#2f6b62" },
    { id: "alliance-join", title: "加入联盟", width: 300, height: 72, background: "#3d6b8a" },
    { id: "alliance-member-settings", title: "成员设置", width: 300, height: 72, background: "#5a4a8a" },
    { id: "alliance-war", title: "联盟战争", width: 300, height: 72, background: "#3a6a8a" },
    { id: "alliance-territory", title: "领地旗帜", width: 300, height: 72, background: "#2f5a72" },
    { id: "alliance-march-boost", title: "行军加速", width: 300, height: 72, background: "#6a3d7a" },
    { id: "alliance-invite", title: "邀请成员", width: 300, height: 72, background: "#5a4a72" },
    { id: "alliance-gift", title: "联盟礼物", width: 300, height: 72, background: "#6a4a3d" },
    { id: "alliance-help", title: "联盟帮助", width: 300, height: 72, background: "#4a5a3d" },
    { id: "alliance-board", title: "留言板", width: 300, height: 72, background: "#3d4a6a" },
    { id: "alliance-tech", title: "联盟科技", width: 300, height: 72, background: "#4d3d6a" },
    { id: "shop-getitem", title: "获取道具", width: 300, height: 72, background: "#8a6a2d" },
    { id: "restored-home", title: "还原 UI 预览", width: 300, height: 90, background: "#1e4d6b" },
]);

export const CATALOG_TITLES = Object.freeze(Object.fromEntries(
    CATALOG_TILES.map((tile) => [tile.title, tile.id]),
));

/** Grouped FairyGUI exports used by `ui:preview-fgui --catalog`. */
export const FGUI_CATALOG_OUTS = Object.freeze([
    ".cache/fgui/popups",
    ".cache/fgui/panels",
    ".cache/fgui/heroes",
    ".cache/fgui/alliance-pages",
    ".cache/fgui/home-shop",
]);

export function catalogIdFor(screens) {
    return screens.some((entry) => entry.id === "preview-home") ? "preview-home" : "catalog";
}

export function listDefaultCatalogOuts(root) {
    return FGUI_CATALOG_OUTS
        .map((relative) => resolve(root, relative))
        .filter((dir) => isFguiExport(dir));
}

export function isFguiExport(dir) {
    const report = join(dir, "report.json");
    const preview = join(dir, "preview", "index.html");
    if (!existsSync(report) || !existsSync(preview)) return false;
    try {
        return JSON.parse(readFileSync(report, "utf8")).kind === "uniflex-fgui-export";
    } catch {
        return false;
    }
}

export function resolvePreviewGroups({ root, out, merge = [], catalog = false } = {}) {
    const dirs = [];
    if (out) dirs.push(resolve(root, out));
    if (catalog) dirs.push(...listDefaultCatalogOuts(root));
    for (const extra of merge) dirs.push(resolve(root, extra));
    const unique = [];
    const seen = new Set();
    for (const dir of dirs) {
        if (seen.has(dir) || !isFguiExport(dir)) continue;
        seen.add(dir);
        unique.push({
            name: basename(dir),
            exportDir: dir,
            previewDir: join(dir, "preview"),
        });
    }
    return unique;
}

export function loadMergedScreens(groups, catalog, { prefixGroups = groups.length > 1 } = {}) {
    const screens = [];
    const seen = new Set();
    const byId = new Map((catalog?.screens ?? []).map((entry) => [entry.id, entry]));
    for (const group of groups) {
        const report = readJson(join(group.exportDir, "report.json"));
        const mapping = readJson(join(group.exportDir, "mapping.json")) ?? {};
        const details = new Map((report?.screenDetails ?? []).map((entry) => [entry.id, entry]));
        for (const id of report?.screens ?? []) {
            if (seen.has(id)) continue;
            const detail = details.get(id);
            const screen = byId.get(id);
            const componentName = detail?.componentName ?? screen?.componentName;
            if (!componentName) continue;
            const mapped = mapping[componentName];
            screens.push({
                id,
                group: prefixGroups ? group.name : "",
                packageName: mapped?.package ?? detail?.packageName ?? `UniFlex_${componentName}`,
                componentName,
                width: detail?.canvas?.width ?? screen?.canvas?.width ?? 750,
                height: detail?.canvas?.height ?? screen?.canvas?.height ?? 1624,
                commonPackage: COMMON_PACKAGE,
                tabOf: detail?.tabOf,
                tabLabel: detail?.tabLabel,
                activeTabLabel: detail?.activeTabLabel,
            });
            seen.add(id);
        }
    }
    return screens;
}

function readJson(path) {
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}
