/**
 * 配色与 tonemapping 预补偿。⛔ 不碰 cc、⛔ 不改场景全局。
 *
 * builtin-unlit 的片元是 `SRGBToLinear(vcolor) * ... ` 再经 CCFragOutput 的
 * `LinearToSRGB`；档位为 LINEAR(1) 时两者互逆、顶点色原样出片；档位为 DEFAULT/ACES(0) 时
 * 中间被塞了一条 ACES 曲线，无贴图层会明显发暗。
 * slg 的做法是去改场景全局把档位掰成 1；这里改为**预补偿**：把顶点色先反解一次。
 */
import { SgzzGridState, type SgzzGridStateValue } from "../../../shared/kits/sgzzmap/api/territory/index";

export type SgzzRgba = readonly [number, number, number, number];

/** 地形 id → 基色（与内容包调色板同序，terrain.info.json 的 palette）。 */
export const SGZZ_TERRAIN_COLORS: readonly SgzzRgba[] = Object.freeze([
    [0.537, 0.580, 0.392, 1],   // 0 平原
    [0.337, 0.439, 0.290, 1],   // 1 森林
    [0.588, 0.580, 0.439, 1],   // 2 丘陵
    [0.482, 0.510, 0.494, 1],   // 3 山地
    [0.376, 0.502, 0.541, 1],   // 4 水域
    [0.243, 0.373, 0.424, 1],   // 5 海
    [0.439, 0.518, 0.408, 1],   // 6 湿地
    [0.690, 0.651, 0.486, 1],   // 7 荒漠
    [0.502, 0.490, 0.412, 1],   // 8 图外
]);

/** 关系态 → 领地叠色。⚠ 按**关系**上色，⛔ 不按同盟 id 分配色相。 */
const STATE_COLORS: ReadonlyMap<number, SgzzRgba> = new Map<number, SgzzRgba>([
    [SgzzGridState.MY, [0.271, 0.541, 0.886, 0.42]],
    [SgzzGridState.MY_ADDITION_LAND, [0.400, 0.639, 0.914, 0.42]],
    [SgzzGridState.UNION, [0.247, 0.706, 0.639, 0.38]],
    [SgzzGridState.GANG_MASTER, [0.180, 0.792, 0.690, 0.44]],
    [SgzzGridState.UNION_CAPTURE, [0.408, 0.769, 0.949, 0.34]],
    [SgzzGridState.GANG_FRIEND, [0.573, 0.784, 0.404, 0.34]],
    [SgzzGridState.RIVAL, [0.859, 0.322, 0.302, 0.40]],
    [SgzzGridState.GANG_RIVAL, [0.800, 0.263, 0.400, 0.40]],
]);

export function sgzzTerrainColor(terrainId: number): SgzzRgba {
    return SGZZ_TERRAIN_COLORS[terrainId] ?? SGZZ_TERRAIN_COLORS[0];
}
/** 无主格返回 null（不铺叠色）。 */
export function sgzzStateColor(state: SgzzGridStateValue): SgzzRgba | null {
    return STATE_COLORS.get(state) ?? null;
}

const ACES_A = 2.51, ACES_B = 0.03, ACES_C = 2.43, ACES_D = 0.59, ACES_E = 0.14;
function acesToneMap(x: number): number {
    return Math.max(0, Math.min(1, (x * (ACES_A * x + ACES_B)) / (x * (ACES_C * x + ACES_D) + ACES_E)));
}

/**
 * 求出「送进管线后能落到 target 的那个顶点色」。
 * 档位 1（LINEAR）时管线对顶点色是恒等，直接返回；档位 0（ACES）时二分反解
 * —— ACES 在 [0,1] 上单调，⛔ 不用解析求根也稳。
 */
export function sgzzCompensate(target: SgzzRgba, toneMappingType: number): SgzzRgba {
    if (toneMappingType === 1) return target;
    const out: number[] = [];
    for (let i = 0; i < 3; i += 1) {
        const want = Math.max(0, Math.min(1, target[i]));
        let lo = 0, hi = 1;
        for (let step = 0; step < 24; step += 1) {
            const mid = (lo + hi) / 2;
            // 管线：SRGBToLinear(v) = v²，ACES，LinearToSRGB = sqrt
            if (Math.sqrt(acesToneMap(mid * mid)) < want) lo = mid; else hi = mid;
        }
        out.push((lo + hi) / 2);
    }
    return [out[0], out[1], out[2], target[3]];
}
