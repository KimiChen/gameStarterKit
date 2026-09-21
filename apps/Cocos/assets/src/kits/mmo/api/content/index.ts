/**
 * mmo kit · `content` api 面（客户端，docs/MMO.md §7.2 / §7.5）：客户端地图几何（内置灰盒包）与表现映射注册表 `IPresentationMap`
 * （presentationId → 表现描述；MK0 = 2D 公告板的颜色 / 尺寸，3d.md SD9：`model` 预留）。⛔ 不 import cc；本面任何导出变化都要 bump `api.content.version`。
 */
import { indexContentPack, mergeItemTemplates, validateContentPack, type IClassTemplate, type IContentPackIndex, type IItemTemplate, type IMapDef } from "../../../../shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "../../../../shared/kits/mmo/content/greybox";
import { KIT_CONTRIBUTIONS } from "../../contributions.generated";

export type { IClassTemplate, IContentPackIndex, IItemTemplate, IMapDef };

let cachedPacks: readonly IContentPackIndex[] | null = null;
let cachedItems: ReadonlyMap<string, IItemTemplate> | null = null;

/** 全部内容包（MK4-B2：贡献点 `content` 的插件 JSON 在前、内置灰盒兜底；每份过 validateContentPack，坏包抛 ⇒ 装载期拒）。 */
export function contentPacks(): readonly IContentPackIndex[] {
    if (cachedPacks === null) {
        const contributed = (KIT_CONTRIBUTIONS as { readonly content: readonly { readonly pluginId: string; readonly value: unknown }[] }).content;
        const packs = [...contributed.map((entry) => indexContentPack(validateContentPack(entry.value))), indexContentPack(validateContentPack(GREYBOX_PACK))];
        const items = mergeItemTemplates(packs); // 与服务端同闸：失败不缓存，包顺序不得改变物品含义。
        cachedPacks = packs;
        cachedItems = items;
    }
    return cachedPacks;
}

/** 承载该图的包（贡献包优先）；没有 = null。 */
export function packForMap(mapId: string): IContentPackIndex | null {
    return contentPacks().find((index) => index.mapById.has(mapId)) ?? null;
}

/** 表现描述（2D 公告板首版：颜色 RGBA + 边长；`model` = 3D 预制路径，预留）。 */
export interface IPresentationEntry {
    readonly label: string;
    readonly color: readonly [number, number, number, number];
    readonly size: number;
    readonly model?: string;
}

export type IPresentationMap = Readonly<Record<string, IPresentationEntry>>;

/** 内置表现映射（灰盒：角色蓝、史莱姆绿；未知 id 回落灰）。MK4 改由内容插件经贡献点 presentation 交来。 */
export const BUILTIN_PRESENTATION: IPresentationMap = Object.freeze({
    fighter: { label: "战士", color: [70, 130, 210, 255], size: 44 },
    caster: { label: "法师", color: [150, 100, 220, 255], size: 44 },
    slime: { label: "史莱姆", color: [110, 200, 120, 255], size: 36 },
    boar: { label: "野猪", color: [160, 110, 70, 255], size: 40 },
    rat: { label: "田鼠", color: [150, 150, 130, 255], size: 26 },
    // MK2-B3 掉落（kind loot 的 templateId = itemId）
    "slime-gel": { label: "史莱姆凝胶", color: [230, 210, 90, 255], size: 18 },
    "boar-hide": { label: "野猪皮", color: [210, 160, 100, 255], size: 18 },
    "rusty-blade": { label: "锈剑", color: [200, 200, 220, 255], size: 18 },
});

export const FALLBACK_PRESENTATION: IPresentationEntry = Object.freeze<IPresentationEntry>({ label: "?", color: [140, 140, 140, 255], size: 32 });

let cachedPresentation: IPresentationMap | null = null;

/** 生效的表现映射（MK4-B2：贡献点 `presentation` 的插件模块（按插件 id 顺序覆盖）盖在内置之上）。 */
export function presentationMap(): IPresentationMap {
    if (cachedPresentation === null) {
        const contributed = (KIT_CONTRIBUTIONS as { readonly presentation: readonly { readonly pluginId: string; readonly value: unknown }[] }).presentation;
        let merged: Record<string, IPresentationEntry> = { ...BUILTIN_PRESENTATION };
        for (const entry of contributed) {
            if (typeof entry.value !== "object" || entry.value === null) throw new Error(`[mmo content] 插件 ${entry.pluginId} 的 presentation 贡献不是映射`);
            merged = { ...merged, ...(entry.value as Record<string, IPresentationEntry>) };
        }
        cachedPresentation = Object.freeze(merged);
    }
    return cachedPresentation;
}

export function presentationOf(presentationId: string, map: IPresentationMap = presentationMap()): IPresentationEntry {
    return map[presentationId] ?? FALLBACK_PRESENTATION;
}

/** 客户端地图几何（size / spawnPoints / aoi）；不在任何包内 = null。 */
export function mapDefOf(mapId: string): IMapDef | null {
    return packForMap(mapId)?.mapById.get(mapId) ?? null;
}

/** 职业模板（速度 / HP / MP 的客户端同源；贡献包优先；不在包内 = null）。 */
export function classOf(classId: string): IClassTemplate | null {
    for (const index of contentPacks()) { const klass = index.classById.get(classId); if (klass) return klass; }
    return null;
}

/** 全区物品模板（同 id 必须同定义；不在任何包内 = null）。 */
export function itemTemplateOf(itemId: string): IItemTemplate | null {
    contentPacks();
    return cachedItems!.get(itemId) ?? null;
}

/** 首图 id（选角页「进入世界」的缺省目标：首个包的首图；角色有最新检查点图时用检查点图）。 */
export function defaultMapId(): string {
    return contentPacks()[0]!.pack.maps[0]!.mapId;
}
/** @deprecated 用 defaultMapId()（MK4-B2 起内容按贡献包解析；保留给既有调用） */
export const DEFAULT_MAP_ID = GREYBOX_PACK.maps[0]!.mapId;
