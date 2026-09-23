/** 地名坐标沿用原表；档位只改变优先级和字号，再按实际视口避让。 */
import { mapoGrid2Pos } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { MAPO_AREA_LABELS, MAPO_CANTON_LABELS, MAPO_CITY_SITES, type IMapoLabel } from "../../../shared/kits/mapOriginal/content/labels.data";
export type MapoLabelTier = "city" | "area" | "canton";
export interface IMapoPlacedLabel {
    readonly name: string; readonly row: number; readonly col: number;
    readonly x: number; readonly y: number; readonly size: number;
    readonly tier: MapoLabelTier; readonly priority: number; readonly level: number;
}
export function mapoLabelTier(lod: number): MapoLabelTier { return lod >= 3 ? "canton" : lod === 2 ? "area" : "city"; }
export function mapoCityLabelSize(cityType: string, level: number): number {
    if (level >= 10) return 28;
    if (cityType === "大型城池") return 24;
    if (cityType === "中型城池") return 20;
    return 16;
}
function place(list: readonly IMapoLabel[], size: number, tier: MapoLabelTier, priority: number): IMapoPlacedLabel[] {
    return list.map((e) => ({ ...e, ...mapoGrid2Pos(e.row, e.col), size, tier, priority, level: 0 }));
}
const CANTONS = place(MAPO_CANTON_LABELS, 30, "canton", 300);
const AREAS = place(MAPO_AREA_LABELS, 22, "area", 200);
const CITIES: readonly IMapoPlacedLabel[] = MAPO_CITY_SITES.map((site) => ({
    ...site, ...mapoGrid2Pos(site.row, site.col), size: mapoCityLabelSize(site.cityType, site.level),
    tier: "city", priority: 100 + site.level, level: site.level,
}));
export const MAPO_LABEL_COUNTS = { canton: CANTONS.length, area: AREAS.length, city: CITIES.length } as const;

/** 郡/大区档仍保留重要城名，不能在城市模型还在时把城名整组清空。 */
export function mapoLabelsFor(lod: number): readonly IMapoPlacedLabel[] {
    if (lod === 0) return CITIES;
    const cities = CITIES.filter((c) => lod < 2 || c.level >= (lod === 2 ? 6 : 8))
        .map((c) => ({ ...c, size: lod === 1 ? Math.min(22, c.size) : 16 }));
    return lod === 1 ? cities : [...(lod === 2 ? AREAS : CANTONS), ...cities];
}
export interface MapoLabelCamera { readonly x: number; readonly y: number; readonly scale: number; readonly width: number; readonly height: number }
export interface MapoScreenLabel extends IMapoPlacedLabel { readonly sx: number; readonly sy: number; readonly width: number; readonly height: number }
export interface MapoLabelRect { left: number; right: number; top: number; bottom: number }
function overlaps(a: MapoLabelRect, b: MapoLabelRect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
export function mapoLayoutLabels(lod: number, cam: MapoLabelCamera, obstacles: readonly MapoLabelRect[] = []): MapoScreenLabel[] {
    const used = [...obstacles], out: MapoScreenLabel[] = [];
    for (const item of [...mapoLabelsFor(lod)].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))) {
        const width = [...item.name].length * item.size + 8, height = item.size + 8;
        const sx = (item.x - cam.x) * cam.scale + cam.width / 2;
        const sy = (cam.y - item.y) * cam.scale + cam.height / 2 + (item.tier === "city" ? height / 2 + 8 : 0);
        const box = { left: sx - width / 2 - 4, right: sx + width / 2 + 4, top: sy - height / 2 - 4, bottom: sy + height / 2 + 4 };
        if (box.left < 0 || box.right > cam.width || box.top < 0 || box.bottom > cam.height) continue;
        if (used.some((other) => overlaps(box, other))) continue;
        used.push(box); out.push({ ...item, sx, sy, width, height });
    }
    return out;
}

export function mapoCityMarkers(lod: number, cam: MapoLabelCamera): { sx: number; sy: number; major: boolean }[] {
    if (lod < 2) return [];
    const out: { sx: number; sy: number; major: boolean }[] = [];
    for (const city of [...CITIES].sort((a, b) => b.level - a.level)) {
        if (lod === 3 && city.level < 8) continue;
        const sx = (city.x - cam.x) * cam.scale + cam.width / 2, sy = (cam.y - city.y) * cam.scale + cam.height / 2;
        if (sx < 8 || sx > cam.width - 8 || sy < 8 || sy > cam.height - 8) continue;
        if (out.some((p) => Math.abs(p.sx - sx) < 12 && Math.abs(p.sy - sy) < 12)) continue;
        out.push({ sx, sy, major: city.level >= 8 });
    }
    return out;
}
