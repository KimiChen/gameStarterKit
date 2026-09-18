# UniFlex 运行时（入库副本）

- 来源：根目录 `vendor/uniflex/` 的 `@uniflex/core|cocos|web@0.1.1` npm 制品。
- `core/` 使用制品内的 Cocos 兼容包（Vue 已打进 chunks），不要再走 `node_modules/@uniflex/*`。
- `cocos/` 与 `web/` 里对 `@uniflex/core/*` 的导入已改成相对路径。
- `package.json` 的 `type: module` 让 Cocos 把这些 `.js` 当 ESM，而不是 CJS。
- `mod/` 下的 `.ts` 入口把无扩展名的项目导入接到带 `.js` 的 ESM 文件；不要手改。
- 作者态 AOT 仍使用 `@uniflex/compiler` / `@uniflex/tooling`，不要把编译器放进本目录。

本目录由 `npm run fetch:uniflex` 生成。不要手改 JS/d.ts；升级时替换 vendor tarball 后重跑脚本，
再 `npm run sync:client` 并重钉 `scripts/vendor.sha256`。
