/**
 * LobbyRoom ws-RPC 契约聚合 —— 双端共享的「WebSocket 单次请求」类型真源。
 *
 * 传输层消息名（LOBBY_MSG_RPC / LOBBY_MSG_PUSH）在 ../messages.ts；本目录只管
 * 路由名与 req/res 形状。新增一个域：建 ./<域>.ts 后在此 ① export *、
 * ② LobbyRpcMap extends、③ ALL_LOBBY_RPC_TYPES 并入，三处各一行。
 */
import { GuildRpc, type GuildRpcMap } from "./guild";
import { MailRpc, type MailRpcMap } from "./mail";
import { ShopRpc, type ShopRpcMap } from "./shop";
import { UserRpc, type UserRpcMap } from "./user";

export * from "./envelope";
export * from "./economy";
export * from "./user";
export * from "./mail";
export * from "./shop";
export * from "./push";
export * from "./guild";

/** 全量路由契约（服务端 defineRpc 与客户端 WebSocketClient.rpc 的公共类型域） */
export interface LobbyRpcMap extends UserRpcMap, MailRpcMap, ShopRpcMap, GuildRpcMap {}

export type LobbyRpcType = keyof LobbyRpcMap;
export type RpcReq<T extends LobbyRpcType> = LobbyRpcMap[T]["req"];
export type RpcRes<T extends LobbyRpcType> = LobbyRpcMap[T]["res"];

/** 幂等写路由子集（req 含 clientReqId）——服务端 defineRpc(idem:true) 与客户端 rpcIdem 的类型域 */
export type LobbyRpcIdemType = {
    [K in LobbyRpcType]: RpcReq<K> extends { clientReqId: string } ? K : never;
}[LobbyRpcType];

/** 运行时全集：服务端 loader 启动校验 + 契约测试用。新增路由若漏在此处，服务端拒绝启动。 */
export const ALL_LOBBY_RPC_TYPES: readonly LobbyRpcType[] = [
    ...Object.values(UserRpc),
    ...Object.values(MailRpc),
    ...Object.values(ShopRpc),
    ...Object.values(GuildRpc),
];
