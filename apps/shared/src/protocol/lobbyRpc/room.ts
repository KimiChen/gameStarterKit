/**
 * room 域稳定 façade（真源在 ./domains/room.ts；本文件只保住稳定 import 路径，与
 * user/mail/shop/guild 同形态）。
 * ⛔ 不在此新增声明；域 descriptor（default 导出）不经 façade 转发，按域文件路径消费。
 */
export * from "./domains/room";
