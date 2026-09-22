/**
 * 画面设置：沙盘模式 / 镜头视角 / 色彩模式 / 画质 —— 纯逻辑，⛔ 不碰 cc。
 *
 * 复刻原作《三国志·战略版》「设置 → 画面设置」四项。原作行为（字符串实证）：
 *   - 沙盘模式 2D/3D 由 `dimension_mgr:is_3d()` 决定，两套 config 与图层表；
 *   - 镜头视角是 **3D 专属**：「2d不支持调整镜头参数」「2D沙盘不支持鸟瞰视角」；
 *   - 色彩模式只留下「色彩模式已切换为」这句提示，选项名是图片按钮、⛔ 没留字符串；
 *   - 画质 流畅 / 普通 / 高清 / 超高 / 自定义（`quality_mgr`、`change_quality_level`）。
 *
 * ⚠ 本 kit v1 **只实现 2D 沙盘**：框架级 Stage3D（`docs/3d.md` SC0–SC5）零实施，
 *   ⛔ 不在 kit 内自建 3D 相机（与 3d.md 方向冲突，且与 sgzzmap/slg 同场时场景全局互相覆盖）。
 *   3D 档位与镜头视角按**原作同样的理由**置灰 —— 契约一次做对，将来接 3D ⛔ 不改协议。
 */

export type MapoSandboxMode = "2d" | "3d";
export type MapoColorMode = "standard" | "vivid" | "muted";
export type MapoQuality = "smooth" | "normal" | "high" | "ultra";

/** 镜头预设：原作横/竖屏各四套（camera_default / 01 / 02 / 03）。v1 只登记，不生效。 */
export type MapoCameraPreset = 0 | 1 | 2 | 3;

export interface IMapoGraphicsSettings {
    readonly sandbox: MapoSandboxMode;
    readonly colorMode: MapoColorMode;
    readonly quality: MapoQuality;
    /** 鸟瞰视角开关。原作：2D 沙盘 ⛔ 不支持。 */
    readonly birdview: boolean;
    readonly cameraPreset: MapoCameraPreset;
}

export const MAPO_DEFAULT_GRAPHICS: IMapoGraphicsSettings = {
    sandbox: "2d", colorMode: "standard", quality: "normal",
    birdview: false, cameraPreset: 0,
};

export const MAPO_SANDBOX_LABELS: Readonly<Record<MapoSandboxMode, string>> = {
    "2d": "2D 沙盘", "3d": "3D 沙盘",
};
export const MAPO_COLOR_LABELS: Readonly<Record<MapoColorMode, string>> = {
    standard: "标准", vivid: "鲜艳", muted: "低饱和",
};
export const MAPO_QUALITY_LABELS: Readonly<Record<MapoQuality, string>> = {
    smooth: "流畅", normal: "普通", high: "高清", ultra: "超高",
};

export interface IMapoSettingAvailability {
    readonly enabled: boolean;
    /** 置灰时给用户看的原因；⚠ 与原作同义，⛔ 不要写成「未实现」糊弄。 */
    readonly reason: string;
}

/** 3D 沙盘在本仓的状态：框架件未落地。⚠ 改这条要同步 docs/3d.md §10 的实施状态。 */
export const MAPO_SANDBOX_3D_REASON = "3D 沙盘需要框架级 Stage3D（docs/3d.md SC0–SC5），当前未实施";

export function mapoSandboxAvailability(mode: MapoSandboxMode): IMapoSettingAvailability {
    if (mode === "3d") return { enabled: false, reason: MAPO_SANDBOX_3D_REASON };
    return { enabled: true, reason: "" };
}

/** 镜头视角（含鸟瞰）：原作在 2D 下就不可调，v1 同此。 */
export function mapoCameraAvailability(s: IMapoGraphicsSettings): IMapoSettingAvailability {
    if (s.sandbox === "2d") return { enabled: false, reason: "2D 沙盘不支持调整镜头参数与鸟瞰视角" };
    return { enabled: true, reason: "" };
}

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

/** 合法化外来设置（存档/旧版本），⛔ 不信任输入。 */
export function mapoNormalizeGraphics(input: unknown): IMapoGraphicsSettings {
    const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    const pick = <T extends string>(v: unknown, all: readonly T[], def: T): T =>
        (typeof v === "string" && (all as readonly string[]).includes(v) ? v as T : def);
    const sandbox = pick<MapoSandboxMode>(o.sandbox, ["2d", "3d"], "2d");
    const out: IMapoGraphicsSettings = {
        // ⚠ 3D 不可用时**落回 2D**，⛔ 不要留一个选中但不生效的档位
        sandbox: mapoSandboxAvailability(sandbox).enabled ? sandbox : "2d",
        colorMode: pick<MapoColorMode>(o.colorMode, ["standard", "vivid", "muted"], "standard"),
        quality: pick<MapoQuality>(o.quality, ["smooth", "normal", "high", "ultra"], "normal"),
        birdview: o.birdview === true,
        cameraPreset: ([0, 1, 2, 3] as const).includes(o.cameraPreset as MapoCameraPreset)
            ? o.cameraPreset as MapoCameraPreset : 0,
    };
    // 2D 下鸟瞰不可用 ⇒ 强制关掉（与原作一致）
    return mapoCameraAvailability(out).enabled ? out : { ...out, birdview: false, cameraPreset: 0 };
}

export const MAPO_GRAPHICS_STORAGE_KEY = "mapOriginal.graphics.v1";
