/**
 * world 域的非生成 wire 助手（BF2）。
 *
 * schema（`apps/shared/schema/protocols/C2S/world.json`）用 `check` 引用本文件的具名函数。
 * 三个闸都是「长度 + 字符集」的复合判据；`endpoint` 还多一条「空串 = 与当前区 gameWsUrl 相同」
 * 的**领域语义**（空串是合法值，不能走 `validateWebSocketOrigin` 的 1..2048 下限）。
 *
 * 字段名·路由·可空性·错误码仍由 schema 声明，⛔ 不在这里复制。
 */
import { boundedString, validateWebSocketOrigin, WireValidationError } from "../../http";

/** mapId 形状（与 protocol/rooms.ts validateWorldMapId 同一正则）。 */
export function validateWorldMapId(value: unknown, path: string): string {
    const id = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(id)) throw new WireValidationError("WORLD_RPC_MAP_ID", path);
    return id;
}

/** 不透明 ticket 串形状（base64url 字符集；权威校验在服务端 sha256 记录侧）。 */
export function validateWorldTicket(value: unknown, path: string): string {
    const ticket = boundedString(value, path, 16, 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(ticket)) throw new WireValidationError("WORLD_RPC_TICKET", path);
    return ticket;
}

/** world 进程公开地址：空串 = 与当前区 gameWsUrl 相同（world 进程拆分前，PS4）。 */
export function validateWorldEndpoint(value: unknown, path: string): string {
    return value === "" ? "" : validateWebSocketOrigin(value, path);
}
