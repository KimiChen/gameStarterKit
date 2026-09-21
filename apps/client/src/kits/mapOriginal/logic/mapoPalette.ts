/**
 * 配色：类基色 + **色彩模式三档** + tonemapping 预补偿。纯逻辑，⛔ 不碰 cc。
 *
 * ⚠ 原作「色彩模式」的选项名没留字符串（是图片按钮），这里是**等价实现**：
 *   标准 / 鲜艳 / 低饱和 —— 用户 2026-09-22 拍板。
 * ⚠ ⛔ 不写 `director.getScene().globals`：slg 为抵消 tonemapping 去改场景全局，
 *   已被 `docs/3d.md` §0.1 点名为待迁移侵入；两个 kit 同场时 restore 会互相吃掉。
 *   本 kit 只**读**管线档位，在顶点色上预补偿。
 */
import type { MapoColorMode } from "./mapoSettings";

export type MapoRgb = readonly [number, number, number];

/** 亮度权重（Rec.709）。 */
function luma(c: MapoRgb): number {
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function clamp255(v: number): number {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** 按色彩模式调整饱和度；standard 原样返回（⛔ 不做无谓运算）。 */
export function mapoApplyColorMode(c: MapoRgb, mode: MapoColorMode): MapoRgb {
    if (mode === "standard") return c;
    const k = mode === "vivid" ? 1.45 : 0.55;
    const l = luma(c);
    return [clamp255(l + (c[0] - l) * k),
            clamp255(l + (c[1] - l) * k),
            clamp255(l + (c[2] - l) * k)];
}

/**
 * tonemapping 预补偿：管线开了 tonemapping 时顶点色会被整体压暗，
 * 这里按档位提前提亮，⛔ 不去改场景全局。`exposure` 由 View 层读管线后传入。
 */
export function mapoCompensate(c: MapoRgb, exposure: number): MapoRgb {
    if (!(exposure > 0) || exposure === 1) return c;
    const g = 1 / exposure;
    return [clamp255(255 * Math.pow(c[0] / 255, g)),
            clamp255(255 * Math.pow(c[1] / 255, g)),
            clamp255(255 * Math.pow(c[2] / 255, g))];
}

/** 一次算好整张调色板，渲染时按 id 直取。⛔ 不要逐格现算。 */
export function mapoBuildPalette(base: readonly MapoRgb[], mode: MapoColorMode,
                                 exposure = 1): MapoRgb[] {
    return base.map((c) => mapoCompensate(mapoApplyColorMode(c, mode), exposure));
}

/** 顶点色是**相乘**的：贴了图集就取纯白，⛔ 拿地形色去乘会把贴图整体染一遍。 */
export const MAPO_TEXTURED_TINT: MapoRgb = [255, 255, 255];
