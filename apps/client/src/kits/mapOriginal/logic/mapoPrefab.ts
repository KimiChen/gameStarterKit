/** 预制体 sprite 记录：56 B，与 prefab_visual.py 对应。 */
import { mapoOriginalPxToWorld } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import type { MapoSpriteInput } from "./mapoMesh";

/** 原版 libnative-lib 0xb08c8c / 0xb2bc8c：4096 档角度、1024 精度 cos 表。 */
export function mapoPrefabCos(index: number): number {
    const wrapped = index & 4095;
    const c = Math.trunc(Math.cos((wrapped & 2047) * Math.PI / 2048) * 1024 + 0.5);
    return (wrapped & 2048 ? -c : c) / 1024;
}

export function mapoPrefabSkew(x: number, y: number, sx: number, sy: number): readonly [number, number, number, number] {
    // ARM FCVTAS：半值向远离 0 的方向取整。随后 base SRT × skew，不能用 tan 剪切。
    const index = (deg: number): number => Math.sign(deg) * Math.round(Math.abs(Math.fround(Math.fround(deg) * Math.fround(4096 / 360))));
    const ix = index(x), iy = index(y);
    return [mapoPrefabCos(iy), mapoPrefabCos(1024 - iy) * sy / sx,
            -mapoPrefabCos(1024 - ix) * sx / sy, mapoPrefabCos(ix)];
}

export interface MapoPrefabVisual {
    readonly sprite: Omit<MapoSpriteInput, "row" | "col" | "uv">;
    readonly mirrorX: boolean;
    readonly mirrorY: boolean;
}

export function mapoReadPrefabVisual(v: DataView, o: number): MapoPrefabVisual {
    const f = (offset: number): number => {
        const value = v.getFloat32(o + offset);
        if (!Number.isFinite(value)) throw new Error("mapOriginal prefab 参数非有限数");
        return value;
    };
    const sx = f(10), sy = f(14), width = f(22), height = f(26);
    if (sx === 0 || sy === 0 || width <= 0 || height <= 0) throw new Error("mapOriginal prefab 显示尺寸非法");
    const color = (offset: number): [number, number, number, number] =>
        [0, 1, 2, 3].map((i) => v.getUint8(o + offset + i) / 255) as [number, number, number, number];
    return {
        sprite: { x: mapoOriginalPxToWorld(f(2)), y: mapoOriginalPxToWorld(f(6)),
            w: mapoOriginalPxToWorld(width * sx), h: mapoOriginalPxToWorld(height * sy),
            angleDeg: f(18), pivot: [f(30), f(34)], skewBasis: mapoPrefabSkew(f(38), f(42), sx, sy),
            rgba: color(48), addColor: color(52) },
        mirrorX: v.getUint8(o + 46) !== 0, mirrorY: v.getUint8(o + 47) !== 0,
    };
}

export function mapoPrefabUv(uv: readonly [number, number, number, number], x: boolean, y: boolean): readonly [number, number, number, number] {
    return [uv[0] + (x ? uv[2] : 0), uv[1] + (y ? uv[3] : 0), x ? -uv[2] : uv[2], y ? -uv[3] : uv[3]];
}
