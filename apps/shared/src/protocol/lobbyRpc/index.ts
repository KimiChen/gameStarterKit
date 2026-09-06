/**
 * LobbyRoom ws-RPC 契约聚合 —— 双端共享的「WebSocket 单次请求」类型入口（稳定 façade）。
 *
 * 传输层消息名（LOBBY_MSG_RPC / LOBBY_MSG_PUSH）在 ../messages.ts；本目录只管
 * 路由名与 req/res 形状。阶段 3 起全集聚合（LobbyRpcMap/ALL_LOBBY_RPC_TYPES/validator
 * maps/错误码/推送）由 `registry.generated.ts` 生成——真源是 `domains/<域>.ts` 的
 * `defineLobbyRpcDomain` descriptor 与 `coreErrors.ts` 的 core 段。
 *
 * 新增一个域：建 ./domains/<域>.ts（路由名 + 类型 + validator + default descriptor）
 * → `npm --workspace @game/server run codegen:plugins` → 服务端 websocket/<域>/<接口>.ts
 * → 测试向量 apps/server/test/lobbyRpcVectors/<域>.ts。⛔ 本文件与 envelope/push 不再登记。
 */
export * from "./canonicalJson";
export * from "./defineDomain";
export * from "./primitives";
export * from "./envelope";
export * from "./economy";
export * from "./user";
export * from "./mail";
export * from "./shop";
export * from "./push";
export * from "./guild";
export * from "./room";
export * from "./registry.generated";
