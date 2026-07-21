/**
 * compute worker 的引导壳（.mjs 原生加载，不依赖任何 loader）。
 *
 * 为什么不能直接 new Worker("./worker.ts")：
 *  - Node 22 的 worker 线程里，execArgv 传 `--import tsx` 的模块钩子不生效
 *    （22.18+ 原生 type-stripping 兜住了 .ts 本体，但 extensionless 相对导入全炸；
 *    Node 24+ 钩子随线程继承才无此问题）——CI Node 22 实翻车，本地 26 无症状。
 *  - 修法：线程内程序化双注册（tsx/cjs 补 require 链、tsx/esm register 补 import 链），
 *    再动态加载真正的 worker.ts。⚠ 两个注册缺一不可：单 esm 注册时 tsx 会把入口
 *    路由进 require(esm) 循环拒载，单 cjs 注册解析不了 ESM 图。
 */
import "tsx/cjs";
import { register } from "tsx/esm/api";
register();
await import("./worker.ts");
