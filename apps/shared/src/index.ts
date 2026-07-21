/**
 * @game/shared —— 双端共享的协议 / 常量 / 纯逻辑。
 *
 * 约束（Cocos 编译器安全 + 零依赖）：
 *  - 只允许 TypeScript 语言本身与 ES 标准库（Math、JSON、Map...）
 *  - 禁止 import 任何 npm 包、Node API（fs/path/process...）、cc 模块、DOM/wx API
 *  - 禁止 const enum（Cocos 按 isolatedModules 单文件转译，const enum 不安全）
 *  - 服务端通过 workspace 依赖 @game/shared 引用；
 *    客户端通过 `npm run sync:shared` 同步到 apps/client/src/shared 后相对路径引用
 */
// ⚠ 显式 /index 文件导入，禁目录导入（"./protocol"）：主进程有 tsx resolver 兜底，
// 但 worker 线程在 Node 22 ESM 下不认目录导入（compute 池加载 shared 公式时炸），
// Cocos SystemJS 同样挑剔（参见 lib/bitecs Relation.ts 的 ./index 改写）。机检见
// apps/server/test/dir-import-ban.test.ts。
export * from "./protocol/index";
export * from "./constants/index";
export * from "./logic/index";
