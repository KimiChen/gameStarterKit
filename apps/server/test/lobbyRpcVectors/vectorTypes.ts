/**
 * Lobby RPC 测试向量 sidecar 的类型（Non-intrusive §5.6 阶段 3）。
 *
 * 每个域一份 `lobbyRpcVectors/<域>.ts`，default 导出该域全部路由的最小合法
 * request/response 向量；通用测试（lobby-rpc-vectors.test.ts）负责：
 * 域集合 ⇔ 文件集合、路由 ⇔ 向量双向相等、validator 正反向、幂等/模式断言。
 * ⛔ 向量只住测试侧——不进 shared/runtime descriptor，也不同步进 Cocos。
 */
import type { LobbyRpcType, RpcReq, RpcRes } from "@game/shared";

export type LobbyRpcVectorFile = {
  readonly [K in LobbyRpcType]?: {
    readonly request: RpcReq<K>;
    readonly response: RpcRes<K>;
  };
};
