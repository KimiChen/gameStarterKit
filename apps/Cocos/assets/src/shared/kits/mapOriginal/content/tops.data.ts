/**
 * mapOriginal `_top_group` **手摆细节**（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 原版 `_polygon_group` 铺底色多边形、配对的 `_top_group` 是若干个 `sprite_2d`
 *   （MAPORIGINAL-2D §1.6）：底是「面」、top 是「手摆的点缀」（岸石 / 草丛 / 雪堆 / 沙丘纹）。
 * ★ **每族一张图集**：river 597 件 / desert 481 件 / snow 821 件，合计 **1899 件**。
 *   三族合并放不进 4096²（river 一族的贴图总面积就有 1,546 万 px²），而每族本来各有一个材质。
 * ⚠ 图集按 **0.4×** 缩存，`nativeSize` 记**原版像素**（贴图采样依据，与山族件同惯例）：
 *   本仓世界尺度 = 32/150 = 0.213 ⇒ 900 px 的件在 LOD0 只占 192 世界像素，
 *   存 360 px 仍有约 1.9× 过采样。⛔ 别按原生像素装，那要 59 MB 显存。
 * ⚠ 组内次序按 **`low_z` 升序**（同值按子序）—— 原版靠它定同组内谁压谁，⛔ 别按子节点原序。
 */

import type { MapoTextureLayouts } from "./atlas-layout.types";

export interface IMapoTopCell {
    readonly id: number;
    readonly textureId: string;
}

export interface IMapoTopAtlas {
    readonly kind: string;
    readonly size: readonly [number, number];
    /** 该族的组数（⚠ 必须与该族几何库条数相等）与件数。 */
    readonly groups: number;
    readonly sprites: number;
    readonly cells: readonly IMapoTopCell[];
    readonly textures: MapoTextureLayouts;
}

/** 单件记录长度（u16 图集格 + 6 × f32）。 */
export const MAPO_TOP_RECORD_BYTES = 60;
export const MAPO_TOP_DOWNSCALE = 0.4;
export const MAPO_TOP_KINDS: readonly string[] = ["river", "desert", "snow"];
export interface IMapoTopConfig {
    readonly schemaVersion: 1;
    readonly mapId: string;
    readonly kind: "tops";
    readonly atlases: readonly IMapoTopAtlas[];
    readonly scenes: Readonly<Record<string, Readonly<Record<number, import("./prefabs.types").IMapoPrefabNode>>>>;
}
