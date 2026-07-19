/**
 * 设计分辨率单一真源——竖屏 750×1624（与 settings/v2/packages/project.json 的 designResolution、
 * Main.ts 的 setDesignResolutionSize 三处必须一致；回流自 Arthur designSpec）。
 *
 * 零依赖小模块：视图层兜底常量一律从这里引，⛔ 禁止写 640/1386、960×640、750×1334 等旧稿魔法数
 * （Arthur 2026-07-12 分辨率审计：旧稿坐标系是「UI 偏小 + 黑边」的放大器）。
 * 正常路径应优先读运行时画布（Canvas UITransform / GRoot.inst），本常量只作画布取不到时的兜底。
 */
export const DESIGN_WIDTH = 750;
export const DESIGN_HEIGHT = 1624;
