/**
 * @game/shared —— 双端共享的协议 / 常量 / 纯逻辑。
 *
 * 约束（Cocos 编译器安全 + 零依赖）：
 *  - 只允许 TypeScript 语言本身与 ES 标准库（Math、JSON、Map...）
 *  - 禁止 import 任何 npm 包、Node API（fs/path/process...）、cc 模块、DOM/wx API
 *  - 禁止 const enum（Cocos 按 isolatedModules 单文件转译，const enum 不安全）
 *  - 服务端通过 workspace 依赖 @game/shared 引用；
 *    客户端通过 `npm run sync:shared` 同步到 client/assets/src/shared 后相对路径引用
 */
export * from "./protocol";
export * from "./constants";
export * from "./logic";
