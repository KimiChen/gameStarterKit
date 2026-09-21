/**
 * 运行时接缝：View 层要的少数宿主能力（时钟 / 帧回调 / 关页）。
 * ⚠ 顶层只声明，由 kit entry 在 install 时注入；⛔ View 不直接摸 PluginHost。
 */
export interface MapoRuntime {
    readonly now: () => number;
    readonly tick: (callback: (dt: number) => void) => () => void;
    readonly close: () => void;
}

let runtime: MapoRuntime | null = null;

/** 注入并返回一个撤销函数（供 context.own 收口）。 */
export function setMapoRuntime(next: MapoRuntime): () => void {
    runtime = next;
    return () => { runtime = null; };
}

export function mapoRuntime(): MapoRuntime {
    if (!runtime) throw new Error("mapOriginal 运行时未注入（kit entry 没 install？）");
    return runtime;
}

export function mapoRuntimeOrNull(): MapoRuntime | null { return runtime; }
