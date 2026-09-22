/**
 * 地名层：原版的**大区名**（9 个）与**郡名**（55 个）+ 249 座城的**城名**。纯逻辑，⛔ 不碰 cc。
 *
 * ⚠ 位置用原表自带的 `grid`（每条地名的落点），⛔ 不是我们算的分区质心 ——
 * 原作把地名摆在人看着舒服的地方，质心常常压在山里或海上。城名落在城中心格
 * （`MAPO_CITY_SITES` 的 row/col，打包期已套美术偏移前的真坐标）。
 * ⚠ 分档：近档（LOD 0–1）看城名，中档（LOD 2）看郡，远档（LOD ≥ 3）看大区。
 *   ⛔ 三档不要一起画（近档挤成一团）。
 */
import { mapoGrid2Pos } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_AREA_LABELS, MAPO_CANTON_LABELS, MAPO_CITY_SITES, type IMapoLabel,
} from "../../../shared/kits/mapOriginal/content/labels.data";

export interface IMapoPlacedLabel {
    readonly name: string;
    readonly row: number;
    readonly col: number;
    /** 世界坐标。 */
    readonly x: number;
    readonly y: number;
    readonly size: number;
}

export type MapoLabelTier = "city" | "area" | "canton";

/** 这一档显示哪一级地名。⚠ LOD 0..1 城名、2 郡、≥3 大区。 */
export function mapoLabelTier(lod: number): MapoLabelTier {
    return lod >= 3 ? "canton" : lod === 2 ? "area" : "city";
}

function place(list: readonly IMapoLabel[], size: number): IMapoPlacedLabel[] {
    return list.map((e) => {
        const p = mapoGrid2Pos(e.row, e.col);
        return { name: e.name, row: e.row, col: e.col, x: p.x, y: p.y, size };
    });
}

/**
 * 城名字号：大型 > 中型 > 小型；洛阳（10 级，全图唯一）再突出一档。
 * ⚠ 上限不能压过大区名的 30（远档才是全局地名）。
 */
export function mapoCityLabelSize(cityType: string, level: number): number {
    if (level >= 10) return 28;
    if (cityType === "大型城池") return 24;
    if (cityType === "中型城池") return 20;
    return 16;
}

/** 大区的字号比郡大一档；城名按类型/等级分档（见上）。 */
const CANTONS = place(MAPO_CANTON_LABELS, 30);
const AREAS = place(MAPO_AREA_LABELS, 20);
const CITIES: readonly IMapoPlacedLabel[] = MAPO_CITY_SITES.map((site) => {
    const p = mapoGrid2Pos(site.row, site.col);
    return { name: site.name, row: site.row, col: site.col, x: p.x, y: p.y,
             size: mapoCityLabelSize(site.cityType, site.level) };
});

/** 该档要画的地名（全量；可见性裁剪交给渲染层）。 */
export function mapoLabelsFor(lod: number): readonly IMapoPlacedLabel[] {
    const tier = mapoLabelTier(lod);
    return tier === "canton" ? CANTONS : tier === "area" ? AREAS : CITIES;
}

export const MAPO_LABEL_COUNTS = { canton: CANTONS.length, area: AREAS.length, city: CITIES.length } as const;
