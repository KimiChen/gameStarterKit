export interface MapLayer { readonly id: "terrain" | "ownership" | "grid" | "decorations" | "landmarks"; readonly hideAtLod: number }
export const MAP_LAYERS: readonly MapLayer[] = [
    { id: "terrain", hideAtLod: 4 }, { id: "ownership", hideAtLod: 4 }, { id: "grid", hideAtLod: 2 },
    { id: "decorations", hideAtLod: 3 }, { id: "landmarks", hideAtLod: 4 },
];
export type MapLayerId = MapLayer["id"];
export function isMapLayerId(value: unknown): value is MapLayerId {
    return typeof value === "string" && MAP_LAYERS.some((layer) => layer.id === value);
}
/** lod 生效层，再减去调试隐藏层（hideAtLod 是内容规则，hidden 是 GM 覆写）。 */
export function visibleMapLayers(lod: number, hidden?: ReadonlySet<string>): readonly MapLayerId[] {
    return MAP_LAYERS.filter((layer) => lod < layer.hideAtLod && !hidden?.has(layer.id)).map((layer) => layer.id);
}
