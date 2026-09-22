/**
 * room 域的非生成 wire 助手（BF2）。
 *
 * schema（`apps/shared/schema/protocols/C2S/room.json`）用 `check` 引用本文件的具名函数。
 * 三个闸都是「长度 + 字符集」的复合判据（声明式只有单一 `pattern`，且正则不匹配要能被客户端
 * 按码分派），因此形状留在本文件；字段名·路由·错误码仍由 schema 声明。
 *
 * 码的分工（§6.8）：格式非法走这里的 `ROOM_RPC_*` / `ROOM_CODE_FORMAT`（request validator 拒绝）；
 * 折叠类领域错误 `ROOM_CODE_UNAVAILABLE` 等由 descriptor 的 errorCodes 声明，不在这里。
 */
import { boundedString, WireValidationError } from "../../http";

/** mode / profile id 形状（与 protocol/rooms.ts 的 id 约束同一正则）。 */
export function validateRoomId(value: unknown, path: string): string {
    const id = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
        throw new WireValidationError("ROOM_RPC_ID", path);
    }
    return id;
}

/** 不透明 ticket 串形状（base64url 字符集；权威校验在服务端 sha256 记录侧）。 */
export function validateRoomTicket(value: unknown, path: string): string {
    const ticket = boundedString(value, path, 16, 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(ticket)) {
        throw new WireValidationError("ROOM_RPC_TICKET", path);
    }
    return ticket;
}

/** 六位码：只接受恰好 6 个 ASCII 数字的**字符串**；空白/符号/非字符串一律拒绝。 */
export function validateRoomCode(value: unknown, path: string): string {
    if (typeof value !== "string" || !/^\d{6}$/.test(value)) {
        throw new WireValidationError("ROOM_CODE_FORMAT", path);
    }
    return value;
}
