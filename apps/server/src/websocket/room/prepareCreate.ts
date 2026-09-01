/**
 * 私房创建预备（Non-intrusive §6.8）：配额原子检查 + 签发绑定
 * `uid + sId + mode + modeVersion + profile + purpose=create + jti + exp` 的 creation ticket。
 * idempotent-write：clientReqId 进通用幂等层，ticket 的 jti 状态机建立在其上（⛔ 不另起一套）。
 * 领域逻辑在 core/rooms/privateRoomRpc.ts（room 目录每个 .ts 皆端点）。
 */
import { handleRoomPrepareCreate } from "../../core/rooms/privateRoomRpc";
import { defineRpc } from "../rpc";

export default defineRpc("room.prepareCreate", {
  handler: (ctx, payload) => handleRoomPrepareCreate(ctx.uid, payload),
});
