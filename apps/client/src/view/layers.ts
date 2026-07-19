/**
 * 页面层级（渲染顺序 base < popup < top；ViewMgr 按此序懒建三个全屏容器）。
 * viewRegistry 的 meta.layer 取值域。纯数据，无头可检。
 */
export const VIEW_LAYERS = ["base", "popup", "top"] as const;

export type ViewLayer = (typeof VIEW_LAYERS)[number];
