/**
 * mail 域稳定 façade（阶段 3 起真源在 ./domains/mail.ts；本文件只保住既有 import 路径）。
 * ⛔ 不在此新增声明；域 descriptor（default 导出）不经 façade 转发，按域文件路径消费。
 */
export * from "./domains/mail";
