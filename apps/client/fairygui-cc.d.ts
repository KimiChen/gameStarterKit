/**
 * fairygui-cc 扩展的 db:// 导入类型映射。运行时由 Creator 从 `db://fairygui-cc/fairygui.mjs` 加载
 * （`apps/client/extensions/fairygui-cc/`，`npm run fetch:fgui` 生成）；类型来自扩展自带的 fairygui.d.ts。
 *
 * ⚠ fairygui 的 d.ts 依赖真 cc 类型，故本声明不在 tsconfig.typecheck.json 的 include 内
 *   （**排除在无头 cc-stub typecheck 外**），仅 Cocos Creator 自带 tsconfig（真 cc）使用。
 */
declare module "db://fairygui-cc/fairygui.mjs" {
  export * from "fairygui-cc";
}
