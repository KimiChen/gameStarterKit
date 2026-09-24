/**
 * 画面设置：**只有画质一项** —— 纯逻辑，⛔ 不碰 cc。
 *
 * ★ **本 kit 只承载原版 2D 沙盘**，3D 沙盘另开 kit `mapOriginal3d`（2026-09-22 拍板）。
 *   原作「设置 → 画面设置」四项里有**三项半是 3D 侧的**，都已移出本 kit：
 *   - **沙盘模式**是跨 kit 的事，⛔ 不该由 2D kit 提供一个永远选不动的 3D 档位；
 *   - **镜头视角**（fov/angle/distance）只存在于 `script/util/viewport_3d_cfg.lua`，
 *     2D 的 `util/viewport.lua` 只有 `vp_scale_min/max/default`；
 *   - **鸟瞰** 7 条显示层（`birdview_*`）在 `map_layer_config.lua` 里**全部且仅**落在 `ShowLayers3d`；
 *   - **色彩模式（LUT）**：`dimension_mgr` 的 `set_lut_type` 写完本地配置后有一道
 *     `if not self:is_3d() then return end`（反汇编 `dimension_mgr.lua.disasm:565-588`），
 *     **2D 下改它不派发任何渲染事件**；消费侧 `graphic_effect_lut.lua` 与 `probe_GI`/
 *     `sun_light`/`height_fog`/`shadow` 同住 `logic/graphic/graphic_effect_5th/`（3D 渲染管线）；
 *     面板上 `btn_lut_click` 与 `btn_camera_click` 是并排四按钮之一、红点判据也与
 *     `is_select_3d_scene` 并列。⇒ 它是第四项 3D 档位，一并移出。
 *   ⚠ 原作在 2D 下是把这些区**整块隐藏**（`setting_screen_dimension` 的 `show_camera_view`），
 *   ⛔ 不是置灰 —— 早先本 kit 写「按原作同因置灰」，出处是 GM 调试台的串，是错的。
 *
 * ⚠ 剩下的**画质**也没有原版 2D 对照：`quality_mgr_2d.lua` 是只继承 base 的**空壳**，
 *   全部渲染旋钮都在 `quality_mgr_3d.lua` ⇒ 本 kit 映射成「资源件与动态水面的开关」
 *   是**自创的等价实现**，⛔ 别写成「复刻原作」。
 */

export type MapoQuality = "smooth" | "normal" | "high" | "ultra";

export interface IMapoGraphicsSettings {
    readonly quality: MapoQuality;
}

export const MAPO_DEFAULT_GRAPHICS: IMapoGraphicsSettings = { quality: "normal" };

export const MAPO_QUALITY_LABELS: Readonly<Record<MapoQuality, string>> = {
    smooth: "流畅", normal: "普通", high: "高清", ultra: "超高",
};

/*
 * ⚠ 这里**故意没有**「分帧建格步长」（M1-B2 删除）：`mapoCreateStepFor` / `createStep`
 *   曾经存在但**一个消费方都没有**，README 还写着「画质映射到分帧建格步长」—— 是空头。
 *   原版一格 300×150 px，本 kit 一格 64×32 世界单位；现在没有分帧建格消费者。
 *   真要做再加，⛔ 别再留没人调的旋钮。
 */

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
 * 合法化外来设置，⛔ 不信任输入 —— 它是 `setGraphics(next: unknown)` 的唯一兜底。
 * ⚠ 设置只活在页模型的内存字段里，本 kit **不落盘**（早先有个 `MAPO_GRAPHICS_STORAGE_KEY`
 *   常量，但全仓无读写方，已删）。所以 ⛔ 不存在「旧存档兼容」问题，多余字段直接忽略即可。
 */
export function mapoNormalizeGraphics(input: unknown): IMapoGraphicsSettings {
    const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    const pick = <T extends string>(v: unknown, all: readonly T[], def: T): T =>
        (typeof v === "string" && (all as readonly string[]).includes(v) ? v as T : def);
    return { quality: pick<MapoQuality>(o.quality, ["smooth", "normal", "high", "ultra"], "normal") };
}
