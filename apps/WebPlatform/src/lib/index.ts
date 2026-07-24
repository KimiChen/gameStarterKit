/**
 * WebPlatform lib 桶（MySQL-only，⛔ 零 HTTP——不含 Fastify entry）。
 * apps/server 的 inProcessAccount 内嵌 import 此桶（`@game/webplatform/lib`）；
 * prod-split 的 Fastify `src/index.ts` 包这些函数成端点。
 */
export { useServerPool, nextSeq } from "./mysql";
export * from "./auth";
export * from "./character";
export * from "./login";
export * from "./wxClient";
