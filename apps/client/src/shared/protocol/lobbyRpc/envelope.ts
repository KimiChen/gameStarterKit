/**
 * LobbyRoom ws-RPC 信封与错误码 —— 双端共享的**类型真源**。
 *
 * 服务端 websocket/dispatcher.ts（RpcEnvelope/RpcReply）与 core/errors.ts（ErrCode）
 * 直接别名引用本文件（Arthur 停回流后单源合一，不存在镜像漂移）。
 * 登记新错误码顺序：docs/server/07 错误码表 → 此处 RPC_ERR_CODES → 服务端 ERR_MAP 映射。
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

/** 服务端错误码全集（07 错误码表的机器实体；服务端 ErrCode 即此联合类型）。 */
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
    "ORDER_MISMATCH",
    "INTERNAL",
] as const;

export type RpcErrCode = (typeof RPC_ERR_CODES)[number];
