export interface MapLayer { readonly id: "terrain" | "ownership" | "grid" | "decorations" | "landmarks"; readonly hideAtLod: number }
export const MAP_LAYERS: readonly MapLayer[] = [
    { id: "terrain", hideAtLod: 4 }, { id: "ownership", hideAtLod: 4 }, { id: "grid", hideAtLod: 2 },
    { id: "decorations", hideAtLod: 3 }, { id: "landmarks", hideAtLod: 4 },
];
export function visibleMapLayers(lod: number): readonly MapLayer["id"][] {
    return MAP_LAYERS.filter((layer) => lod < layer.hideAtLod).map((layer) => layer.id);
}
