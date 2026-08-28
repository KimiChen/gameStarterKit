/**
 * fairygui-cc 扩展的 db:// 导入类型映射。运行时由 Creator 从 `db://fairygui-cc/fairygui.mjs` 加载
 * （`apps/Cocos/extensions/fairygui-cc/`，运行时随仓库入库；`npm run fetch:fgui` 仅供框架维护团队
 * 显式升级时更新）；类型来自扩展自带的 fairygui.d.ts。
 *
 * ⚠ fairygui 的完整 d.ts 依赖真 cc 类型，故本映射仅供 Cocos Creator 自带 tsconfig（真 cc）使用；
 *   apps/client 的两个无头探针使用各自的最小 cc/FairyGUI 声明桩，不依赖本文件。
 */
declare module "db://fairygui-cc/fairygui.mjs" {
  export * from "fairygui-cc";
}
