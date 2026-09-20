/**
 * world 域 ws-RPC 契约（MMO MF8-B4，docs/MMO.md §5.4 MF8 / D27）：进入世界与交接解析。两条路由都是 query——凭据是可丢弃的一次性准入凭证，
 * ⛔ 不产生领域写入；权威准入仍是 WorldRoom 的固定时序（claim / acquireControl / activate）。
 *  - `world.enter { personaId, mapId, line? }` → `{ worldAddress, mapId, line, endpoint, ticket, expiresAt, transferId }`：签发首次进入凭据
 *    （服务端绑定 uid / persona / 目标分线地址 / 当前 controlEpoch）；persona 有 **Committed** 的在途交接时改为解析该交接
 *    （transferId 非 null、目标 = 交接目标，⛔ 不能绕开交接去别的图）；
 *  - `world.resolveTransfer { transferId }` → 同形：回复丢失 / 重连时按 transferId 重取凭据（凭据轮换：旧凭据作废）；
 *  - push `world.transfer { transferId, personaId }`：跨房唤醒（K_STREAM_PUSH kind=room，MF8-B6，best-effort，权威仍在 world_transfer 表）。
 * 错误码：WORLD_PERSONA_INVALID（persona 不存在 / 非本账号 / 非 active）；WORLD_TRANSFER_INVALID（交接不存在 / 非本账号 / 未 Committed 或已终态）；
 * WORLD_LINE_UNAVAILABLE（MF10-B1：指定分线越过 WORLD_MAX_LINES_PER_MAP，或全部分线已满且到上限）；WORLD_SERVICE_UNAVAILABLE（基础设施抖动，可重试）。
 * `line` 缺省由服务端分配（满员开新线）。`endpoint` 为空串 = 与当前区 gameWsUrl 相同（world 进程拆分前，PS4）。
 */
import { assertExactKeys, boundedString, finiteInteger, validateWebSocketOrigin, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";
import { pushRecord, requiredId, rpcRecord } from "../primitives";

/** world 域路由名 */
export const WorldRpc = {
    /** 首次进入 / 常规进入：签发一次性准入凭据（有 Committed 交接时解析交接） */
    Enter: "world.enter",
    /** 交接解析：按 transferId 重取凭据（回复丢失 / 重连） */
    ResolveTransfer: "world.resolveTransfer",
} as const;

export interface IWorldEnterReq {
    personaId: string;
    mapId: string;
    /** 分线；缺省由服务端分配（v1 = 0 号线） */
    line?: number;
}

export interface IWorldEnterRes {
    /** `s<sId>/<mapId>/<line>` */
    worldAddress: string;
    mapId: string;
    line: number;
    /** 承载该分线的 world 进程公开地址（ws/wss origin）；空串 = 与当前区 gameWsUrl 相同 */
    endpoint: string;
    /** 不透明一次性凭据（CSPRNG ≥128bit base64url；服务端只存 sha256） */
    ticket: string;
    /** 凭据过期时刻（ms 时间戳，UX 用；权威过期在服务端记录 PX） */
    expiresAt: number;
    /** 解析自在途交接时为其 transferId，否则 null */
    transferId: string | null;
}

export interface IWorldResolveTransferReq {
    transferId: string;
}
export type IWorldResolveTransferRes = IWorldEnterRes;

/** 跨房唤醒（kind=room）：目标分线据此预热 / 提前解析（best-effort）。 */
export interface IWorldTransferPush {
    transferId: string;
    personaId: string;
}

/** 路由名 → { req, res } */
export interface WorldRpcMap {
    [WorldRpc.Enter]: { req: IWorldEnterReq; res: IWorldEnterRes };
    [WorldRpc.ResolveTransfer]: { req: IWorldResolveTransferReq; res: IWorldResolveTransferRes };
}

/** mapId 形状（与 protocol/rooms.ts validateWorldMapId 同一正则；此处独立实现保持本文件自持）。 */
function worldMapIdShaped(value: unknown, path: string): string {
    const id = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(id)) throw new WireValidationError("WORLD_RPC_MAP_ID", path);
    return id;
}

/** 不透明 ticket 串形状（base64url 字符集；权威校验在服务端 sha256 记录侧）。 */
function worldTicketShaped(value: unknown, path: string): string {
    const ticket = boundedString(value, path, 16, 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(ticket)) throw new WireValidationError("WORLD_RPC_TICKET", path);
    return ticket;
}

function worldLine(value: unknown, path: string): number {
    return finiteInteger(value, path, 0, 65535);
}

function worldEnterResOf(input: unknown): IWorldEnterRes {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["worldAddress", "mapId", "line", "endpoint", "ticket", "expiresAt", "transferId"], [], "response");
    const endpoint = value.endpoint === "" ? "" : validateWebSocketOrigin(value.endpoint, "response.endpoint");
    let transferId: string | null = null;
    if (value.transferId !== null) transferId = boundedString(value.transferId, "response.transferId", 1, 64);
    return {
        worldAddress: boundedString(value.worldAddress, "response.worldAddress", 1, 128),
        mapId: worldMapIdShaped(value.mapId, "response.mapId"),
        line: worldLine(value.line, "response.line"),
        endpoint,
        ticket: worldTicketShaped(value.ticket, "response.ticket"),
        expiresAt: finiteInteger(value.expiresAt, "response.expiresAt", 0),
        transferId,
    };
}

export const validateWorldEnterReq: RuntimeValidator<IWorldEnterReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["personaId", "mapId"], ["line"], "payload");
    const out: IWorldEnterReq = { personaId: requiredId(value, "personaId"), mapId: worldMapIdShaped(value.mapId, "payload.mapId") };
    if (value.line !== undefined) out.line = worldLine(value.line, "payload.line");
    return out;
};

export const validateWorldEnterRes: RuntimeValidator<IWorldEnterRes> = (input) => worldEnterResOf(input);

export const validateWorldResolveTransferReq: RuntimeValidator<IWorldResolveTransferReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["transferId"], [], "payload");
    return { transferId: requiredId(value, "transferId") };
};

export const validateWorldResolveTransferRes: RuntimeValidator<IWorldResolveTransferRes> = (input) => worldEnterResOf(input);

export const validateWorldTransferPush: RuntimeValidator<IWorldTransferPush> = (input) => {
    const value = pushRecord(input, "data");
    assertExactKeys(value, ["transferId", "personaId"], [], "data");
    return { transferId: requiredId(value, "transferId"), personaId: requiredId(value, "personaId") };
};

export default defineLobbyRpcDomain({
    domain: "world",
    // contractVersion 2（MMO MF10-B1）：加 WORLD_LINE_UNAVAILABLE（指定分线越过上限 / 全部分线已满且到上限）。
    contractVersion: 2,
    errorCodes: ["WORLD_PERSONA_INVALID", "WORLD_TRANSFER_INVALID", "WORLD_LINE_UNAVAILABLE", "WORLD_SERVICE_UNAVAILABLE"],
    pushes: [defineLobbyPush("WorldTransfer", "world.transfer", validateWorldTransferPush)],
    routes: [
        defineRpcQuery(WorldRpc.Enter, { request: validateWorldEnterReq, response: validateWorldEnterRes }),
        defineRpcQuery(WorldRpc.ResolveTransfer, { request: validateWorldResolveTransferReq, response: validateWorldResolveTransferRes }),
    ],
});
