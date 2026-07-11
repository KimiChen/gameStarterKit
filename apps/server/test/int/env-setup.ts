/**
 * 测试环境变量前置模块：必须是测试文件的**第一个 import**。
 * ESM import 提升会让模块体先于任何顶层语句执行——直接写在测试文件顶部的
 * `process.env.X = ...` 实际晚于 src/infra/config.ts 的模块级 envInt 读取。
 */
process.env.RPC_RATE_CAPACITY = "200";
process.env.RPC_RATE_REFILL_PER_S = "100";
export {};
