/** 生成物：pack_decor.py，135 个完整 prefab；不选主片、不借其他等级。 */
import type { IMapoPrefabNode } from "./prefabs.types";
import type { MapoTextureLayouts } from "./atlas-layout.types";
export interface IMapoDecorCell {
    readonly id: number;
    readonly kind: "res";
    readonly variant: "base" | "snow" | "desert";
    readonly resType: string;
    readonly level: number;
    readonly prefab: string;
    readonly scene: IMapoPrefabNode;
}
export interface IMapoDecorConfig {
    readonly schemaVersion: 1;
    readonly mapId: string;
    readonly kind: "decor";
    readonly size: readonly [number, number];
    readonly cells: readonly { readonly id: number; readonly textureId: string }[];
    readonly textures: MapoTextureLayouts;
    readonly variants: Readonly<Record<"base" | "snow" | "desert", readonly IMapoDecorCell[]>>;
}
