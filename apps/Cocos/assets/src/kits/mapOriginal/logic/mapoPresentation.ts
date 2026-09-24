/** O5：引擎无关的外置表现配置 reader。先验字节/版本，再完整验证，最后交给地图实例。 */
import type { IMapoDecorConfig } from "../../../shared/kits/mapOriginal/content/decor.data";
import type { IMapoTopConfig } from "../../../shared/kits/mapOriginal/content/tops.data";

export class MapoConfigError extends Error {
    readonly code = "MAPO_CONFIG_INVALID";
    constructor(readonly path: string) { super(`[mapOriginal] MAPO_CONFIG_INVALID ${path}`); }
}
function requireValue(ok: unknown, path: string): asserts ok { if (!ok) throw new MapoConfigError(path); }
type Obj = Record<string, unknown>;
function object(v: unknown, path: string): Obj {
    requireValue(v !== null && typeof v === "object" && !Array.isArray(v), path);
    return v as Obj;
}
function fields(v: unknown, required: string[], optional: string[], path: string): Obj {
    const o = object(v, path), keys = Object.keys(o);
    requireValue(required.every(k => Object.prototype.hasOwnProperty.call(o, k))
        && keys.every(k => required.includes(k) || optional.includes(k)), path);
    return o;
}
function list(v: unknown, path: string, max = 20000): unknown[] {
    requireValue(Array.isArray(v) && v.length <= max, path); return v;
}
function number(v: unknown, path: string, min = -Infinity, max = Infinity): number {
    requireValue(typeof v === "number" && Number.isFinite(v) && v >= min && v <= max, path); return v;
}
function integer(v: unknown, path: string, min = 0, max = 65535): number {
    const n = number(v, path, min, max); requireValue(Number.isInteger(n), path); return n;
}
function vector(v: unknown, n: number, path: string, min = -Infinity, max = Infinity): number[] {
    const a = list(v, path, n); requireValue(a.length === n, path);
    return a.map((x, i) => number(x, `${path}[${i}]`, min, max));
}
function string(v: unknown, path: string): string {
    requireValue(typeof v === "string" && v.length <= 4096, path); return v;
}

/** 严格 UTF-8；不依赖 DOM TextDecoder、Node Buffer 或平台全局。 */
export function mapoParseConfig(bytes: ArrayBuffer | Uint8Array): unknown {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    requireValue(u.length > 0 && u.length <= 4 * 1024 * 1024, "bytes.length");
    // apply 接受 TypedArray 的 array-like 参数；限制每段长度，避免大参数列表溢出。
    // 先转 Latin-1，再仅转义 % 与非 ASCII 字节，由 ES decodeURIComponent 严格校验 UTF-8。
    const parts: string[] = [];
    for (let i = 0; i < u.length; i += 8192) {
        parts.push(String.fromCharCode.apply(null, u.subarray(i, i + 8192) as unknown as number[]));
    }
    let text: string;
    try { text = decodeURIComponent(parts.join("").replace(/[%\x80-\xff]/g, c => "%" + c.charCodeAt(0).toString(16))); }
    catch { throw new MapoConfigError("utf8"); }
    try { return JSON.parse(text) as unknown; }
    catch { throw new MapoConfigError("json"); }
}

function layout(value: unknown, cellsValue: unknown, sizeValue: unknown, atlasId: string, path: string): number {
    const size = vector(sizeValue, 2, `${path}.size`, 1, 16384), textures = object(value, `${path}.textures`);
    requireValue(size.every(Number.isInteger) && Object.keys(textures).length > 0 && Object.keys(textures).length <= 20000, path);
    for (const [id, raw] of Object.entries(textures)) {
        const p = `${path}.textures.${id}`;
        const t = fields(raw, ["textureId", "atlasId", "rect", "nativeSize", "storageSize", "trimRect", "layoutVersion", "contentHash"], [], p);
        requireValue(id !== "__proto__" && id !== "constructor" && id !== "prototype" && t.textureId === id && t.atlasId === atlasId && t.layoutVersion === 1, p);
        requireValue(/^[0-9a-f]{64}$/.test(string(t.contentHash, p)), p);
        const rect = vector(t.rect, 4, p, 0), storage = vector(t.storageSize, 2, p, 1), trim = vector(t.trimRect, 4, p, 0);
        const native = vector(t.nativeSize, 2, p, 1);
        requireValue([...rect, ...storage, ...trim, ...native].every(Number.isInteger), p);
        requireValue(rect[2] > 0 && rect[3] > 0 && rect[0] + rect[2] <= size[0] && rect[1] + rect[3] <= size[1]
            && trim[2] === rect[2] && trim[3] === rect[3] && trim[0] + trim[2] <= storage[0] && trim[1] + trim[3] <= storage[1], p);
    }
    const cells = list(cellsValue, `${path}.cells`); requireValue(cells.length > 0, path);
    cells.forEach((raw, i) => {
        const c = fields(raw, ["id", "textureId"], [], `${path}.cells[${i}]`);
        requireValue(c.id === i && Object.prototype.hasOwnProperty.call(textures, string(c.textureId, path)), path);
    });
    return cells.length;
}
function sceneValidator(textureCount: number) {
    let nodes = 0;
    const texture = (v: unknown, p: string) => integer(v, p, -1, textureCount - 1);
    const visit = (raw: unknown, path: string, depth = 0): void => {
        requireValue(depth <= 64 && ++nodes <= 20000, path);
        const n = fields(raw, ["name", "position", "scale", "angle", "size", "pivot", "skew", "mirror", "color", "add", "z", "texture", "children"],
            ["frames", "frameStart", "frameDuration", "timeline", "tracks", "event"], path);
        string(n.name, path);
        for (const key of ["position", "scale", "size", "pivot", "skew"]) vector(n[key], 2, `${path}.${key}`);
        number(n.angle, path); number(n.z, path); texture(n.texture, `${path}.texture`);
        for (const key of ["color", "add"]) vector(n[key], 4, `${path}.${key}`, 0, 255);
        requireValue(list(n.mirror, path, 2).length === 2 && (n.mirror as unknown[]).every(x => typeof x === "boolean"), path);
        if (n.frames !== undefined) {
            const frames = list(n.frames, `${path}.frames`); requireValue(frames.length > 0, path);
            frames.forEach(v => texture(v, path));
            if (n.frameStart !== undefined) integer(n.frameStart, path, 0, frames.length - 1);
            if (n.frameDuration !== undefined) requireValue(number(n.frameDuration, path) > 0, path);
        } else requireValue(n.frameStart === undefined && n.frameDuration === undefined, path);
        if (n.timeline !== undefined) {
            const t = fields(n.timeline, ["duration", "offset", "speed", "loops"], [], `${path}.timeline`);
            number(t.duration, path, 0); number(t.offset, path); number(t.speed, path); integer(t.loops, path, -1, 2147483647);
        }
        if (n.event !== undefined) {
            const e = fields(n.event, ["start", "duration"], [], `${path}.event`);
            number(e.start, path); number(e.duration, path, 0);
        }
        if (n.tracks !== undefined) for (const rawTrack of list(n.tracks, path, 100)) {
            const t = fields(rawTrack, ["type", "keys"], [], `${path}.track`), type = integer(t.type, path);
            requireValue([0, 1, 2, 3, 4, 5, 12, 13].includes(type), path);
            let last = -Infinity;
            for (const rawKey of list(t.keys, path)) {
                const k = fields(rawKey, ["time", "value", "tween"], [], `${path}.key`);
                const time = number(k.time, path); requireValue(time >= last && typeof k.tween === "boolean", path); last = time;
                if (type === 5) { texture(k.value, path); requireValue(k.tween === false, path); }
                else if (type === 4 || type === 2 && typeof k.value === "number") number(k.value, path);
                else { const v = list(k.value, path, 3); requireValue(v.length === 3 || [0, 1, 13].includes(type) && v.length === 2, path); v.forEach(x => number(x, path)); }
            }
        }
        list(n.children, `${path}.children`).forEach((child, i) => visit(child, `${path}.children[${i}]`, depth + 1));
    };
    return visit;
}
function header(value: unknown, kind: string, extra: string[], mapId: string): Obj {
    const c = fields(value, ["schemaVersion", "mapId", "kind", ...extra], [], kind);
    requireValue(c.schemaVersion === 1 && c.mapId === mapId && c.kind === kind, `${kind}.version`); return c;
}
export function mapoReadDecorConfig(bytes: ArrayBuffer | Uint8Array, mapId = "s1"): IMapoDecorConfig {
    const c = header(mapoParseConfig(bytes), "decor", ["size", "cells", "textures", "variants"], mapId);
    const count = layout(c.textures, c.cells, c.size, "decor", "decor"), visit = sceneValidator(count);
    const variants = fields(c.variants, ["base", "snow", "desert"], [], "decor.variants");
    for (const variant of ["base", "snow", "desert"]) {
        const cells = list(variants[variant], variant, 45); requireValue(cells.length === 45, variant);
        cells.forEach((raw, i) => {
            const p = `decor.${variant}[${i}]`, cell = fields(raw, ["id", "kind", "variant", "resType", "level", "prefab", "scene"], [], p);
            requireValue(cell.id === i + 2 && cell.kind === "res" && cell.variant === variant, p);
            requireValue(["wood", "stone", "food", "iron", "gold"].includes(string(cell.resType, p)), p);
            integer(cell.level, p, 1, 10); string(cell.prefab, p); visit(cell.scene, `${p}.scene`);
        });
    }
    return c as unknown as IMapoDecorConfig;
}
export function mapoReadTopConfig(bytes: ArrayBuffer | Uint8Array, mapId = "s1"): IMapoTopConfig {
    const c = header(mapoParseConfig(bytes), "tops", ["atlases", "scenes"], mapId);
    const atlases = list(c.atlases, "tops.atlases", 3); requireValue(atlases.length === 3, "tops.atlases");
    const scenes = fields(c.scenes, ["river", "desert", "snow"], [], "tops.scenes");
    atlases.forEach((raw, i) => {
        const kind = ["river", "desert", "snow"][i], p = `tops.${kind}`;
        const a = fields(raw, ["kind", "size", "groups", "sprites", "cells", "textures"], [], p);
        requireValue(a.kind === kind, p); integer(a.groups, p, 1); integer(a.sprites, p, 0, 1000000);
        const count = layout(a.textures, a.cells, a.size, `${kind}-top`, p), visit = sceneValidator(count);
        for (const [id, scene] of Object.entries(object(scenes[kind], p))) {
            requireValue(/^(0|[1-9][0-9]*)$/.test(id), p); integer(Number(id), p, 0, (a.groups as number) - 1); visit(scene, `${p}.scenes[${id}]`);
        }
    });
    return c as unknown as IMapoTopConfig;
}
