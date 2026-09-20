/**
 * mmo kit · `content` api 面（客户端，docs/MMO.md §7.2 / §7.5）：客户端地图几何（内置灰盒包）与表现映射注册表 `IPresentationMap`
 * （presentationId → 表现描述；MK0 = 2D 公告板的颜色 / 尺寸，3d.md SD9：`model` 预留）。⛔ 不 import cc；本面任何导出变化都要 bump `api.content.version`。
 */
import type { IClassTemplate, IMapDef } from "../../../../shared/kits/mmo/api/content/index";
import { GREYBOX_PACK } from "../../../../shared/kits/mmo/content/greybox";

export type { IClassTemplate, IMapDef };

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

export function presentationOf(presentationId: string, map: IPresentationMap = BUILTIN_PRESENTATION): IPresentationEntry {
    return map[presentationId] ?? FALLBACK_PRESENTATION;
}

/** 客户端地图几何（size / spawnPoints / aoi）；不在包内 = null。 */
export function mapDefOf(mapId: string): IMapDef | null {
    return GREYBOX_PACK.maps.find((map) => map.mapId === mapId) ?? null;
}

/** 职业模板（速度 / HP / MP 的客户端同源；不在包内 = null）。 */
export function classOf(classId: string): IClassTemplate | null {
    return GREYBOX_PACK.classes.find((klass) => klass.classId === classId) ?? null;
}

/** 首图 id（选角页「进入世界」的缺省目标；角色有最新检查点图时用检查点图）。 */
export const DEFAULT_MAP_ID = GREYBOX_PACK.maps[0]!.mapId;
