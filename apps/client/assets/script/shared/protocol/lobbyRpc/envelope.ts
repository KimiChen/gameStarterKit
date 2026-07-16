/**
 * LobbyRoom ws-RPC 信封与错误码 —— 双端共享。
 *
 * 本文件是服务端权威定义的**镜像**（先例：state.ts 镜像服务端 Schema）：
 *  - IRpcEnvelope / IRpcReply ⇔ apps/server/src/gateway/dispatcher.ts 的 RpcEnvelope/RpcReply
 *  - RPC_ERR_CODES ⇔ apps/server/src/core/errors.ts 的 ErrCode（真源：docs/server/07 错误码表）
 *
 * 框架文件（dispatcher/errors，Arthur 回流件）不 import 本文件；漂移由
 * apps/server/src/gateway/rpc.ts 的编译期互检 + test/lobby-rpc-contract.test.ts 兜底。
 */

/** C2S 请求信封（room.send(LOBBY_MSG_RPC, envelope)）。id 为客户端生成的配对串（1~64 字符）。 */
export interface IRpcEnvelope {
    id: string;
    type: string;
    payload?: unknown;
}

/** S2C 响应信封：原样回带请求 id。客户端只按 err.code 分支，⛔ 禁止解析 msg（09·G3）。 */
export interface IRpcReply {
    id: string;
    ok: boolean;
    data?: unknown;
    err?: { code: string; msg: string };
}

/** 服务端错误码全集（镜像 07 错误码表；增删必须双侧同步，rpc.ts 编译期互检把关）。 */
export const RPC_ERR_CODES = [
    "AUTH_REQUIRED",
    "AUTH_EPOCH_STALE",
    "ACCOUNT_BANNED",
    "RATE_LIMITED",
    "INVALID_PAYLOAD",
    "UNKNOWN_TYPE",
    "INSUFFICIENT_BALANCE",
    "BUSY",
    "STALE_FENCE",
    "IN_PROGRESS",
    "GRANTING",
    "THAWING",
    "USER_DATA_LOST",
    "INTERNAL",
] as const;

export type RpcErrCode = (typeof RPC_ERR_CODES)[number];
