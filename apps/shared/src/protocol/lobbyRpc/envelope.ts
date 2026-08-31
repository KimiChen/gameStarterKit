import { assertExactKeys, boundedString, guardWire, isPlainRecord, type PlainRecord, type RuntimeValidator, WireValidationError } from "../http";
import { isRpcErrCode, type RpcErrCode } from "./registry.generated";

/**
 * LobbyRoom ws-RPC 信封 —— 双端共享的**类型真源**。
 *
 * 服务端 websocket/dispatcher.ts（RpcEnvelope/RpcReply）与 core/errors.ts（ErrCode）
 * 直接别名引用本文件（Arthur 停回流后单源合一，不存在镜像漂移）。
 * 错误码全集自阶段 3 起由 registry.generated.ts 聚合（core 码在 coreErrors.ts、领域码在
 * domains/<域>.ts），本文件只 re-export；登记新 core 错误码顺序见 coreErrors.ts 抬头。
 * ⚠ 防循环：registry.generated ⛔ 不得 import 本文件。
 */

export { isRpcErrCode, RPC_ERR_CODES, type RpcErrCode } from "./registry.generated";

/** C2S 请求信封（room.send(LOBBY_MSG_RPC, envelope)）。id 为客户端生成的配对串（1~64 字符）。 */
export interface IRpcEnvelope {
    id: string;
    type: string;
    payload?: unknown;
}

/** S2C 成功响应信封。 */
export interface IRpcSuccessReply {
    id: string;
    ok: true;
    data?: unknown;
}

/** S2C 失败响应信封；客户端只按 err.code 分支，⛔ 禁止解析 msg（09·G3）。 */
export interface IRpcErrorReply {
    id: string;
    ok: false;
    err: { code: RpcErrCode; msg: string };
}

/** 判别联合让 data/err 混用在编译期和 runtime 都不可行。 */
export type IRpcReply = IRpcSuccessReply | IRpcErrorReply;

const RPC_ID_MAX = 64;

function envelopeRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("RPC_OBJECT", path);
    return input;
}

/** 信封 runtime validator；validated value 是新的 plain object，未知字段不被静默剥离。 */
export function validateRpcEnvelope(input: unknown): IRpcEnvelope {
    return guardWire("rpc", () => {
        const value = envelopeRecord(input, "rpc");
        assertExactKeys(value, ["id", "type"], ["payload"], "rpc");
        const id = boundedString(value.id, "rpc.id", 1, RPC_ID_MAX);
        const type = boundedString(value.type, "rpc.type", 1, RPC_ID_MAX);
        if (!Object.prototype.hasOwnProperty.call(value, "payload") || value.payload === undefined) return { id, type };
        return { id, type, payload: value.payload };
    });
}

/** RPC response runtime validator，按 ok 判别联合严格拒绝 data/err 混用。 */
export function validateRpcReply(input: unknown): IRpcReply {
    return guardWire("reply", () => {
        const value = envelopeRecord(input, "reply");
        assertExactKeys(value, ["id", "ok"], ["data", "err"], "reply");
        const id = boundedString(value.id, "reply.id", 1, RPC_ID_MAX);
        if (typeof value.ok !== "boolean") throw new WireValidationError("RPC_OK", "reply.ok");
        const hasData = Object.prototype.hasOwnProperty.call(value, "data");
        const hasErr = Object.prototype.hasOwnProperty.call(value, "err");
        if (value.ok) {
            if (hasErr) throw new WireValidationError("RPC_REPLY_SHAPE", "reply.err");
            return hasData ? { id, ok: true, data: value.data } : { id, ok: true };
        }
        if (!hasErr || hasData) throw new WireValidationError("RPC_REPLY_SHAPE", "reply");
        const err = envelopeRecord(value.err, "reply.err");
        assertExactKeys(err, ["code", "msg"], [], "reply.err");
        if (!isRpcErrCode(err.code)) throw new WireValidationError("RPC_ERR_CODE", "reply.err.code");
        return { id, ok: false, err: { code: err.code, msg: boundedString(err.msg, "reply.err.msg", 0, 2048) } };
    });
}

/** 便于 adapter 在收到任意信封时统一判定，而无需 try/catch 每个字段。 */
export function isValidRpcEnvelope(input: unknown): input is IRpcEnvelope {
    try { validateRpcEnvelope(input); return true; } catch { return false; }
}

export function isValidRpcReply(input: unknown): input is IRpcReply {
    try { validateRpcReply(input); return true; } catch { return false; }
}

// Re-exported type alias keeps the validator map declaration readable for consumers.
export type RpcValidator<T> = RuntimeValidator<T>;
