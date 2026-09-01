/**
 * room 域 ws-RPC 契约（Non-intrusive §6.8：私房 prepare/resolve 与 access ticket）。
 *
 * 全域通用约定同 domains/user.ts 抬头；本域补充：
 *  - `room.prepareCreate` 归 idempotent-write（§6.8 执行模式已定死）：请求必含 clientReqId，
 *    creation ticket 的 jti 状态机建立在通用幂等层之上，⛔ 不另起一套；
 *  - `room.resolve` 归 query（不产生领域写入；join ticket 是可丢弃的准入凭证）；
 *  - 折叠类错误统一 `ROOM_CODE_UNAVAILABLE`（码不存在/隔离期/过期/mode·profile 不匹配/区不匹配，
 *    响应字节完全相同、不带 detail、不回显 code，§6.8）；保留类 `ROOM_FULL`；
 *    码格式非法走 core `INVALID_PAYLOAD`（request validator 拒绝）；可重试类
 *    `ROOM_START_IN_PROGRESS` 与 `ROOM_SERVICE_UNAVAILABLE` / `ROOM_RESULT_UNKNOWN`
 *    （基础设施抖动 ⛔ 绝不降级为确定性结论，§6.5）。
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError, type RuntimeValidator } from "../../http";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

/** room 域路由名 */
export const RoomRpc = {
    /** 私房创建预备：配额原子检查 + 签发绑定 uid/sId/mode/modeVersion/profile 的 creation ticket */
    PrepareCreate: "room.prepareCreate",
    /** 六位邀请码 → roomId + join ticket（区内定位；最终权威检查仍在 GameRoom admission） */
    Resolve: "room.resolve",
} as const;

export interface IRoomPrepareCreateReq {
    /** 幂等 id（09·I2）：每个逻辑操作生成一次，重试复用 */
    clientReqId: string;
    mode: string;
    /** 该玩法 manifest 的 modeVersion；与服务端 catalog 不一致即拒（防旧包建私房） */
    modeVersion: number;
    profile: string;
}
export interface IRoomPrepareCreateRes {
    /** 不透明 creation ticket（CSPRNG ≥128bit base64url；⛔ 串本身不携带任何自描述声明） */
    creationTicket: string;
    /** ticket 过期时刻（ms 时间戳，UX 用；权威过期在服务端记录 PX） */
    expiresAt: number;
}

export interface IRoomResolveReq {
    /** 六位邀请码：严格 ^\d{6}$ 字符串（"000001" 合法，数字 1 非法，§6.6） */
    code: string;
}
export interface IRoomResolveRes {
    /** opaque Colyseus roomId（裸 roomId 不是完整授权，§6.8） */
    roomId: string;
    mode: string;
    modeVersion: number;
    profile: string;
    /** 不透明 join ticket（绑定 uid/sId/roomId/mode/modeVersion/profile/lease generation） */
    joinTicket: string;
    expiresAt: number;
}

/** 路由名 → { req, res } */
export interface RoomRpcMap {
    [RoomRpc.PrepareCreate]: { req: IRoomPrepareCreateReq; res: IRoomPrepareCreateRes };
    [RoomRpc.Resolve]: { req: IRoomResolveReq; res: IRoomResolveRes };
}

/** mode/profile id 形状（与 protocol/rooms.ts 的 id 约束同一正则；此处独立实现保持本文件自持）。 */
function idShaped(value: unknown, path: string): string {
    const id = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
        throw new WireValidationError("ROOM_RPC_ID", path);
    }
    return id;
}

/** 不透明 ticket 串形状（base64url 字符集；权威校验在服务端 sha256 记录侧）。 */
function ticketShaped(value: unknown, path: string): string {
    const ticket = boundedString(value, path, 16, 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(ticket)) {
        throw new WireValidationError("ROOM_RPC_TICKET", path);
    }
    return ticket;
}

/** 六位码：只接受恰好 6 个 ASCII 数字的字符串；空白/符号/非字符串一律拒绝。 */
function sixDigitCode(value: unknown, path: string): string {
    if (typeof value !== "string" || !/^\d{6}$/.test(value)) {
        throw new WireValidationError("ROOM_CODE_FORMAT", path);
    }
    return value;
}

export const validatePrepareCreateReq: RuntimeValidator<IRoomPrepareCreateReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "mode", "modeVersion", "profile"], [], "payload");
    return {
        clientReqId: requiredId(value, "clientReqId"),
        mode: idShaped(value.mode, "payload.mode"),
        modeVersion: finiteInteger(value.modeVersion, "payload.modeVersion", 1, 1_000_000),
        profile: idShaped(value.profile, "payload.profile"),
    };
};

export const validatePrepareCreateRes: RuntimeValidator<IRoomPrepareCreateRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["creationTicket", "expiresAt"], [], "response");
    return {
        creationTicket: ticketShaped(value.creationTicket, "response.creationTicket"),
        expiresAt: finiteInteger(value.expiresAt, "response.expiresAt", 0),
    };
};

export const validateResolveReq: RuntimeValidator<IRoomResolveReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["code"], [], "payload");
    return { code: sixDigitCode(value.code, "payload.code") };
};

export const validateResolveRes: RuntimeValidator<IRoomResolveRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["roomId", "mode", "modeVersion", "profile", "joinTicket", "expiresAt"], [], "response");
    return {
        roomId: boundedString(value.roomId, "response.roomId", 1, 128),
        mode: idShaped(value.mode, "response.mode"),
        modeVersion: finiteInteger(value.modeVersion, "response.modeVersion", 1, 1_000_000),
        profile: idShaped(value.profile, "response.profile"),
        joinTicket: ticketShaped(value.joinTicket, "response.joinTicket"),
        expiresAt: finiteInteger(value.expiresAt, "response.expiresAt", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "room",
    // 折叠类统一码 / 保留类 / 可重试类的三分见文件抬头；INVALID_PAYLOAD 属 core，不在此登记。
    // ROOM_QUOTA_EXCEEDED：单 uid 活跃私房 + 未消费 creation ticket 超过配额（§6.8）。
    errorCodes: [
        "ROOM_CODE_UNAVAILABLE",
        "ROOM_FULL",
        "ROOM_START_IN_PROGRESS",
        "ROOM_QUOTA_EXCEEDED",
        "ROOM_SERVICE_UNAVAILABLE",
        "ROOM_RESULT_UNKNOWN",
    ],
    routes: [
        defineRpcIdempotentWrite(RoomRpc.PrepareCreate, {
            request: validatePrepareCreateReq,
            response: validatePrepareCreateRes,
        }),
        defineRpcQuery(RoomRpc.Resolve, { request: validateResolveReq, response: validateResolveRes }),
    ],
});
