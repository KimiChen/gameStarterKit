/**
 * 配色：类基色 + tonemapping 预补偿。纯逻辑，⛔ 不碰 cc。
 *
 * ★ **没有「色彩模式」**（2026-09-22 拍板移除）。原作那一项是 3D 侧的：
 *   `dimension_mgr` 的 `set_lut_type` 在写完本地配置后有一道
 *   `if not self:is_3d() then return end`（反汇编 `dimension_mgr.lua.disasm:565-588`：
 *   `[11] SELF→is_3d` / `[13][14][15] TESTSET+EQ+RETURN1`），**2D 下改它不派发任何渲染事件**；
 *   消费侧 `graphic_effect_lut.lua` 与 `probe_GI`/`sun_light`/`height_fog`/`shadow` 同住
 *   `logic/graphic/graphic_effect_5th/`（3D 渲染管线）。⇒ 它随 3D 迁出本 kit。
 *
 * ⚠ ⛔ 不写 `director.getScene().globals`：slg 为抵消 tonemapping 去改场景全局，
 *   已被 `docs/3d.md` §0.1 点名为待迁移侵入；两个 kit 同场时 restore 会互相吃掉。
 *   本 kit 只**读**管线档位，在顶点色上预补偿。
 */

export type MapoRgb = readonly [number, number, number];

function clamp255(v: number): number {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ACES 近似（与引擎 builtin 同式）。
const ACES_A = 2.51, ACES_B = 0.03, ACES_C = 2.43, ACES_D = 0.59, ACES_E = 0.14;
function acesToneMap(x: number): number {
    return Math.max(0, Math.min(1, (x * (ACES_A * x + ACES_B)) / (x * (ACES_C * x + ACES_D) + ACES_E)));
}

/**
 * 求出「送进管线后能落到 target 的那个顶点色」。
 *
 * ⚠ 入参是**管线的 tonemapping 档位枚举**（`postSettings.toneMappingType`：0=DEFAULT/ACES、
 *   1=LINEAR），⛔ 不是「曝光倍数」。早先这里按曝光做 `pow(c, 1/exposure)` 反解，
 *   于是 0 走 `!(0>0)` 返回、1 走 `===1` 返回 —— **两个可能取值都恒等，补偿从不生效**，
 *   而 0（ACES）恰恰是唯一需要补偿的档位。
 * ⚠ 档位 1（LINEAR）管线对顶点色恒等，直接返回；档位 0（ACES）二分反解
 *   —— ACES 在 [0,1] 上单调，⛔ 不用解析求根也稳。
 * ⚠ 本 kit 的颜色是 **0–255 字节空间**（sgzzmap 那份是 0–1）：必须先 /255 再 *255，
 *   ⛔ 直接照抄 `sgzzCompensate` 会把整张表 clamp 成纯白。
 */
export function mapoCompensate(c: MapoRgb, toneMappingType: number): MapoRgb {
    if (toneMappingType === 1) return c;
    const out: number[] = [];
    for (let i = 0; i < 3; i += 1) {
        const want = Math.max(0, Math.min(1, c[i] / 255));
        let lo = 0, hi = 1;
        for (let step = 0; step < 24; step += 1) {
            const mid = (lo + hi) / 2;
            // 管线：SRGBToLinear(v) = v²，ACES，LinearToSRGB = sqrt
            if (Math.sqrt(acesToneMap(mid * mid)) < want) lo = mid; else hi = mid;
        }
        out.push(clamp255(((lo + hi) / 2) * 255));
    }
    return [out[0], out[1], out[2]];
}

/** 一次算好整张调色板，渲染时按 id 直取。⛔ 不要逐格现算。 */
export function mapoBuildPalette(base: readonly MapoRgb[], toneMappingType: number): MapoRgb[] {
    return base.map((c) => mapoCompensate(c, toneMappingType));
}

/** 顶点色是**相乘**的：贴了图集就取纯白，⛔ 拿地形色去乘会把贴图整体染一遍。 */
export const MAPO_TEXTURED_TINT: MapoRgb = [255, 255, 255];
