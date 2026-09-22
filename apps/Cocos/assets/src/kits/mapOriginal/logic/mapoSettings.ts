/**
 * 画面设置：色彩模式 / 画质 —— 纯逻辑，⛔ 不碰 cc。
 *
 * 复刻原作《三国志·战略版》「设置 → 画面设置」中**属于 2D 沙盘的那两项**。原作行为（字符串实证）：
 *   - 色彩模式只留下「色彩模式已切换为」这句提示，选项名是图片按钮、⛔ 没留字符串；
 *   - 画质 流畅 / 普通 / 高清 / 超高 / 自定义（`quality_mgr`、`change_quality_level`）。
 *     ⚠ 原作 `quality_mgr_2d.lua` 是只继承 base 的**空壳**，全部渲染旋钮都在 `quality_mgr_3d.lua`
 *     ⇒ 本 kit 把画质映射成「分帧建格步长 + 建不建摆件层」是**自创的等价实现**，⛔ 无原版对照。
 *
 * ★ **本 kit 只承载原版 2D 沙盘**，3D 沙盘另开 kit `mapOriginal3d`（2026-09-22 拍板）。
 *   所以这里**没有沙盘模式选择器、没有镜头视角、没有鸟瞰**：
 *   - 沙盘模式是**跨 kit 的事**，⛔ 不该由 2D kit 提供一个永远选不动的 3D 档位；
 *   - 镜头视角（fov/angle/distance）只存在于原作 `script/util/viewport_3d_cfg.lua`，
 *     2D 的 `util/viewport.lua` 只有 `vp_scale_min/max/default`；
 *   - 鸟瞰 7 条显示层（`birdview_*`）在 `map_layer_config.lua` 里**全部且仅**落在 `ShowLayers3d`。
 *   ⚠ 原作在 2D 下是把镜头区**整块隐藏**（`setting_screen_dimension` 的 `show_camera_view`），
 *   ⛔ 不是置灰 —— 早先本 kit 写「按原作同因置灰」，出处是 GM 调试台的串，是错的。
 */

export type MapoColorMode = "standard" | "vivid" | "muted";
export type MapoQuality = "smooth" | "normal" | "high" | "ultra";

export interface IMapoGraphicsSettings {
    readonly colorMode: MapoColorMode;
    readonly quality: MapoQuality;
}

export const MAPO_DEFAULT_GRAPHICS: IMapoGraphicsSettings = {
    colorMode: "standard", quality: "normal",
};

export const MAPO_COLOR_LABELS: Readonly<Record<MapoColorMode, string>> = {
    standard: "标准", vivid: "鲜艳", muted: "低饱和",
};
export const MAPO_QUALITY_LABELS: Readonly<Record<MapoQuality, string>> = {
    smooth: "流畅", normal: "普通", high: "高清", ultra: "超高",
};

/** 画质档 -> 分帧建格步长（越高一帧建越多格）。⚠ 与 `mapoLayers` 的门控合用。 */
export function mapoCreateStepFor(q: MapoQuality): number {
    switch (q) {
        case "smooth": return 64;
        case "normal": return 160;
        case "high": return 320;
        default: return 640;
    }
}

/**
 * 画质档 -> 建不建摆件层。
 * ⚠ 这一层**全有或全无**：原版每个资源格都有自己的 res_field，按密度砍一半会出现
 * 「同样的 3 级粮田有的有有的没有」的穿帮 ⇒ ⛔ 别改回密度系数。
 *   要省开销只有整层关掉（流畅档）这一条路；近档一屏本来也只有几十格。
 */
export function mapoDecorEnabledFor(q: MapoQuality): boolean {
    return q !== "smooth";
}

/**
 * 合法化外来设置（存档/旧版本），⛔ 不信任输入。
 * ⚠ 旧存档里可能还有 `sandbox` / `birdview` / `cameraPreset` 三个字段（v1 有过）——
 *   这里**直接忽略**即可：它们随 3D 一起迁出本 kit，⛔ 不要为了兼容再留半套协议。
 */
export function mapoNormalizeGraphics(input: unknown): IMapoGraphicsSettings {
    const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    const pick = <T extends string>(v: unknown, all: readonly T[], def: T): T =>
        (typeof v === "string" && (all as readonly string[]).includes(v) ? v as T : def);
    return {
        colorMode: pick<MapoColorMode>(o.colorMode, ["standard", "vivid", "muted"], "standard"),
        quality: pick<MapoQuality>(o.quality, ["smooth", "normal", "high", "ultra"], "normal"),
    };
}

export const MAPO_GRAPHICS_STORAGE_KEY = "mapOriginal.graphics.v1";
