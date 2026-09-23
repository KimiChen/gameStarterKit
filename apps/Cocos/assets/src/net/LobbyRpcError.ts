import type { RpcErrCode } from "../shared/native/index";

/** 客户端本地错误码；不属于服务端 shared RPC_ERR_CODES。 */
export type LocalErrCode = "CONN_LOST" | "TIMEOUT";

/** 两种 Lobby transport 共用的 RPC 失败形状，调用方只按 code 分支。 */
export class RpcError extends Error {
  clientReqId?: string;

  constructor(
    readonly code: RpcErrCode | LocalErrCode,
    msg = "",
  ) {
    super(msg);
    this.name = "RpcError";
  }
}
