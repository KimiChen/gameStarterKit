/** 原包 prefab 的可移植表现数据；节点 transform 不从贴图尺寸反推。 */
import type { IMapoTextureLayout } from "./atlas-layout.types";
export interface IMapoPrefabKey {
    readonly time: number;
    readonly value: number | readonly number[];
    readonly tween: boolean;
}
export interface IMapoPrefabTrack { readonly type: number; readonly keys: readonly IMapoPrefabKey[]; }
export interface IMapoPrefabNode {
    readonly name: string;
    readonly position: readonly number[];
    readonly scale: readonly number[];
    readonly angle: number;
    readonly size: readonly number[];
    readonly pivot: readonly number[];
    readonly skew: readonly number[];
    readonly mirror: readonly boolean[];
    readonly color: readonly number[];
    readonly add: readonly number[];
    readonly z: number;
    readonly texture: number;
    readonly children: readonly IMapoPrefabNode[];
    readonly frames?: readonly number[];
    readonly frameStart?: number;
    readonly frameDuration?: number;
    readonly timeline?: { readonly duration: number; readonly offset: number; readonly speed: number; readonly loops: number };
    readonly tracks?: readonly IMapoPrefabTrack[];
    readonly event?: { readonly start: number; readonly duration: number };
}
export interface IMapoPrefabCell {
    readonly id: number;
    readonly rect: readonly [number, number, number, number];
    readonly textureId?: string;
    /** 未提供时为完整画布；原始 UI 件等未裁边素材沿用此形态。 */
    readonly window?: Pick<IMapoTextureLayout, "storageSize" | "trimRect">;
}
