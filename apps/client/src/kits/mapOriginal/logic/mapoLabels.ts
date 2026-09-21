/**
 * 地名层：原版的**大区名**（9 个）与**郡名**（55 个）。纯逻辑，⛔ 不碰 cc。
 *
 * ⚠ 位置用原表自带的 `grid`（每条地名的落点），⛔ 不是我们算的分区质心 ——
 * 原作把地名摆在人看着舒服的地方，质心常常压在山里或海上。
 * ⚠ 分档：远档只看大区（近档挤成一团），中近档看郡。⛔ 不要两档一起画。
 */
import { mapoGrid2Pos } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_AREA_LABELS, MAPO_CANTON_LABELS, type IMapoLabel,
} from "../../../shared/kits/mapOriginal/content/labels.data";

export interface IMapoPlacedLabel {
    readonly name: string;
    readonly row: number;
    readonly col: number;
    /** 世界坐标。 */
    readonly x: number;
    readonly y: number;
    /** canton 的字号比 area 大一档。 */
    readonly size: number;
}

/** 这一档显示哪一级地名。⚠ LOD ≥ 3 看大区，0..2 看郡。 */
export function mapoLabelTier(lod: number): "canton" | "area" {
    return lod >= 3 ? "canton" : "area";
}

function place(list: readonly IMapoLabel[], size: number): IMapoPlacedLabel[] {
    return list.map((e) => {
        const p = mapoGrid2Pos(e.row, e.col);
        return { name: e.name, row: e.row, col: e.col, x: p.x, y: p.y, size };
    });
}

const CANTONS = place(MAPO_CANTON_LABELS, 30);
const AREAS = place(MAPO_AREA_LABELS, 20);

/** 该档要画的地名（全量；可见性裁剪交给渲染层，条数只有几十）。 */
export function mapoLabelsFor(lod: number): readonly IMapoPlacedLabel[] {
    return mapoLabelTier(lod) === "canton" ? CANTONS : AREAS;
}

export const MAPO_LABEL_COUNTS = { canton: CANTONS.length, area: AREAS.length } as const;
