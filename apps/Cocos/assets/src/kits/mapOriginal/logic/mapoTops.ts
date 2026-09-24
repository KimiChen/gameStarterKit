import { mapoReadTopConfig } from "./mapoPresentation";
import { mapoSceneAnimated, mapoSceneSprites } from "./mapoScene";
import { compileMapoScene, createMapoScenePlayer, type MapoSceneProgram, type MapoSpriteSource } from "./mapoSceneCompiled";
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
    MAPO_TOP_KINDS, MAPO_TOP_RECORD_BYTES, type IMapoTopAtlas, type IMapoTopCell, type IMapoTopConfig,
} from "../../../shared/kits/mapOriginal/content/tops.data";
import type { MapoPolygonInput, MapoSpriteInput } from "./mapoMesh";

interface TopSprite extends MapoPrefabVisual {
    readonly cell: IMapoTopCell;
}

interface TopLib {
    readonly meta: IMapoTopAtlas;
    /** 下标 = 几何库下标 − 1。 */
    groups: TopSprite[][];
    programs: Map<number, MapoSceneProgram>;
}

export { MAPO_TOP_KINDS };

/** 地图实例的数据读取器；dispose 清空运行时解码结果和 Buffer 视图。 */
export function createMapoTopsData() {
    const LIBS = new Map<string, TopLib>();
    let config: IMapoTopConfig | null = null, sourceBytes = 0;
    function mapoSetTopConfig(bytes: ArrayBuffer | Uint8Array): void {
        const next = mapoReadTopConfig(bytes);
        LIBS.clear();
        for (const meta of next.atlases) LIBS.set(meta.kind, { meta, groups: [], programs: new Map() });
        config = next; sourceBytes = bytes.byteLength;
    }

    /** 注入 `<kind>-tops.bin`。⚠ 组数/件数/长度任一对不上就拒收。 */
    function mapoSetTops(kind: string, buf: ArrayBuffer | Uint8Array): void {
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

    function mapoHasTops(kind: string): boolean {
        return (LIBS.get(kind)?.groups.length ?? 0) > 0;
    }

    /** 可见实例用编译程序；离线 mapoTopsFor 保留完整求值作为对照。 */
    function mapoTopSources(kind: string, polys: readonly MapoPolygonInput[]): MapoSpriteSource[] {
        const lib = LIBS.get(kind);
        if (!lib || !lib.groups.length) return [];
        const cells = lib.meta.cells.map(c => ({ id: c.id, rect: lib.meta.textures[c.textureId].rect, window: lib.meta.textures[c.textureId] }));
        return polys.map(p => {
            const scene = config?.scenes[kind]?.[p.geo - 1];
            if (!scene) {
                const sprites = mapoTopsFor(kind, [p], Infinity);
                return { row: p.s, col: 0, read: () => sprites };
            }
            let program = lib.programs.get(p.geo);
            if (!program) { program = compileMapoScene(scene); lib.programs.set(p.geo, program); }
            return createMapoScenePlayer(program, cells, lib.meta.size, { x: p.x, y: p.y, row: p.s, col: 0 });
        });
    }

    function mapoTopsAnimated(kind: string, polys: readonly MapoPolygonInput[]): boolean {
        return polys.some((p) => {
            const scene = config?.scenes[kind]?.[p.geo - 1];
            return !!scene && mapoSceneAnimated(scene);
        });
    }

    /** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
    function mapoTopUv(kind: string, cell: IMapoTopCell): readonly [number, number, number, number] {
        const meta = LIBS.get(kind)!.meta;
        const [x, y, w, h] = meta.textures[cell.textureId].rect;
        return [x / meta.size[0], y / meta.size[1], w / meta.size[0], h / meta.size[1]];
    }

    /**
     * 把一批多边形摆位展开成手摆件的 sprite。
     * 图片锚点 = 多边形原点 + prefab 局部 position；mesh 使用 prefab 的真实 pivot。
     * @param limit 一屏最多展开多少件（一片水面能带 30 个件，⛔ 必须有上限）。
     */
    function mapoTopsFor(kind: string, polys: readonly MapoPolygonInput[],
                                limit: number, seconds = 0): MapoSpriteInput[] {
        const lib = LIBS.get(kind);
        if (!lib || lib.groups.length === 0) return [];
        const out: MapoSpriteInput[] = [];
        for (const p of polys) {
            const scene = config?.scenes[kind]?.[p.geo - 1];
            if (scene) {
                const cells = lib.meta.cells.map((c) => {
                    const texture = lib.meta.textures[c.textureId];
                    return { id: c.id, rect: texture.rect, window: texture };
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
                    textureWindow: lib.meta.textures[t.cell.textureId],
                    uv: mapoPrefabUv(mapoTopUv(kind, t.cell), t.mirrorX, t.mirrorY),
                });
            }
        }
        return out;
    }

    /** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
    function mapoTopsDataUsage(): Readonly<Record<string, number>> {
        return { arrayBufferBytes: 0, configSourceBytes: sourceBytes, atlases: LIBS.size, programs: [...LIBS.values()].reduce((n, l) => n + l.programs.size, 0), groups: [...LIBS.values()].reduce((sum, l) => sum + l.groups.length, 0),
            sprites: [...LIBS.values()].reduce((sum, l) => sum + l.groups.reduce((n, g) => n + g.length, 0), 0) };
    }

    return { mapoSetTopConfig, mapoSetTops, mapoHasTops, mapoTopsAnimated, mapoTopUv, mapoTopsFor, mapoTopsDataUsage, mapoTopSources,
        get config(): IMapoTopConfig | null { return config; },
        dispose(): void { LIBS.clear(); config = null; sourceBytes = 0; },
    };
}

/** 兼容离线烘焙与已有测试；地图运行时必须使用 MapoDataStore 的独立读取器。 */
export const { mapoSetTopConfig, mapoSetTops, mapoHasTops, mapoTopsAnimated, mapoTopUv, mapoTopsFor, mapoTopsDataUsage } = createMapoTopsData();
