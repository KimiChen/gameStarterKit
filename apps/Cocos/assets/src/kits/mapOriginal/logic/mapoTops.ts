import { MAPO_TOP_SCENES } from "../../../shared/kits/mapOriginal/content/top-scenes.data";
import { mapoSceneAnimated, mapoSceneSprites } from "./mapoScene";
import { mapoReadPrefabVisual, mapoPrefabUv, type MapoPrefabVisual } from "./mapoPrefab";
/**
 * `_top_group` 的**手摆细节**：河流 / snow / desert 三族共用一套机制。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 原版 `_polygon_group` 铺底色多边形、配对的 `_top_group` 是若干个 `sprite_2d`
 *   （MAPORIGINAL-2D §1.6）：底是「面」、top 是「手摆的点缀」（岸石 / 草丛 / 雪堆 / 沙丘纹）。
 *   ⇒ 件的 pos / scale / angle 全来自 prefab，⛔ 这里不撒、不随机、不按格算。
 * ⚠ 组内次序按 **`low_z` 升序**（打包期已排好）：原版靠它定同组内谁压谁，
 *   ⛔ 别在这里重排，也 ⛔ 别按子节点原序。
 * ⚠ 件的世界尺寸 = **prefab.size × prefab.scale**（与山族件 M0-B2 同式），
 *   ⛔ 不是图集里的像素 —— 图集是按 0.4× 缩存的。
 */
import {
    MAPO_TOP_ATLASES, MAPO_TOP_RECORD_BYTES, type IMapoTopAtlas, type IMapoTopCell,
} from "../../../shared/kits/mapOriginal/content/tops.data";
import type { MapoPolygonInput, MapoSpriteInput } from "./mapoMesh";

interface TopSprite extends MapoPrefabVisual {
    readonly cell: IMapoTopCell;
}

interface TopLib {
    readonly meta: IMapoTopAtlas;
    /** 下标 = 几何库下标 − 1。 */
    groups: TopSprite[][];
}

const LIBS: Map<string, TopLib> = new Map(
    MAPO_TOP_ATLASES.map((meta) => [meta.kind, { meta, groups: [] }]));

export const MAPO_TOP_KINDS: readonly string[] = MAPO_TOP_ATLASES.map((a) => a.kind);

/** 注入 `<kind>-tops.bin`。⚠ 组数/件数/长度任一对不上就拒收。 */
export function mapoSetTops(kind: string, buf: ArrayBuffer | Uint8Array): void {
    const lib = LIBS.get(kind);
    if (!lib) throw new Error(`mapOriginal 没有 ${kind} 的手摆件`);
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const g = v.getUint16(0);
    if (g !== lib.meta.groups) throw new Error(`mapOriginal ${kind} 手摆件 ${g} 组 ≠ ${lib.meta.groups}`);
    const counts: number[] = [];
    let total = 0;
    for (let i = 0; i < g; i += 1) {
        const n = v.getUint16(2 + i * 2);
        counts.push(n);
        total += n;
    }
    if (total !== lib.meta.sprites) {
        throw new Error(`mapOriginal ${kind} 手摆件 ${total} 个 ≠ ${lib.meta.sprites}`);
    }
    if (u.length !== 2 + g * 2 + total * MAPO_TOP_RECORD_BYTES) {
        throw new Error(`mapOriginal ${kind} 手摆件表长度不符：${u.length} B`);
    }
    const byId = new Map(lib.meta.cells.map((c) => [c.id, c]));
    const groups: TopSprite[][] = [];
    let o = 2 + g * 2;
    for (const n of counts) {
        const list: TopSprite[] = [];
        for (let k = 0; k < n; k += 1) {
            const cell = byId.get(v.getUint16(o));
            if (!cell) throw new Error(`mapOriginal ${kind} 手摆件引用了不存在的图集格`);
            list.push({ cell, ...mapoReadPrefabVisual(v, o) });
            o += MAPO_TOP_RECORD_BYTES;
        }
        groups.push(list);
    }
    lib.groups = groups;
}

export function mapoHasTops(kind: string): boolean {
    return (LIBS.get(kind)?.groups.length ?? 0) > 0;
}

export function mapoTopsAnimated(kind: string, polys: readonly MapoPolygonInput[]): boolean {
    return polys.some((p) => {
        const scene = MAPO_TOP_SCENES[kind]?.[p.geo - 1];
        return !!scene && mapoSceneAnimated(scene);
    });
}

/** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
export function mapoTopUv(kind: string, cell: IMapoTopCell): readonly [number, number, number, number] {
    const meta = LIBS.get(kind)!.meta;
    const [x, y, w, h] = meta.textures[cell.textureId].rect;
    return [x / meta.size[0], y / meta.size[1], w / meta.size[0], h / meta.size[1]];
}

/**
 * 把一批多边形摆位展开成手摆件的 sprite。
 * 图片锚点 = 多边形原点 + prefab 局部 position；mesh 使用 prefab 的真实 pivot。
 * @param limit 一屏最多展开多少件（一片水面能带 30 个件，⛔ 必须有上限）。
 */
export function mapoTopsFor(kind: string, polys: readonly MapoPolygonInput[],
                            limit: number, seconds = 0): MapoSpriteInput[] {
    const lib = LIBS.get(kind);
    if (!lib || lib.groups.length === 0) return [];
    const out: MapoSpriteInput[] = [];
    for (const p of polys) {
        const scene = MAPO_TOP_SCENES[kind]?.[p.geo - 1];
        if (scene) {
            const cells = lib.meta.cells.map((c) => {
                const texture = lib.meta.textures[c.textureId];
                return { id: c.id, rect: texture.rect, native: texture.nativeSize, source: "" };
            });
            const sprites = mapoSceneSprites(scene, cells, lib.meta.size, seconds,
                { x: p.x, y: p.y, row: p.s, col: 0 });
            if (out.length + sprites.length > limit) return out;
            out.push(...sprites);
            continue;
        }
        const list = lib.groups[p.geo - 1];
        if (!list) continue;
        for (const t of list) {
            if (out.length >= limit) return out;
            out.push({
                // ⚠ row/col 只给画家序用：底层表已是画家序，这里给同序的等距量即可
                row: p.s, col: 0,
                ...t.sprite, x: p.x + t.sprite.x, y: p.y + t.sprite.y,
                uv: mapoPrefabUv(mapoTopUv(kind, t.cell), t.mirrorX, t.mirrorY),
            });
        }
    }
    return out;
}

/** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
export function mapoTopsDataUsage(): Readonly<Record<string, number>> {
    return { arrayBufferBytes: 0, groups: [...LIBS.values()].reduce((sum, l) => sum + l.groups.length, 0),
        sprites: [...LIBS.values()].reduce((sum, l) => sum + l.groups.reduce((n, g) => n + g.length, 0), 0) };
}
