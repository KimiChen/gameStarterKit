/**
 * 六位邀请码 → roomId + join ticket（Non-intrusive §6.8）。query：不产生领域写入
 * （join ticket 是可丢弃准入凭证）。专用速率桶（失败/成功/全区失败）在 handler 内检查，
 * ⛔ 不动 dispatcher 全局闸；错误三分（折叠/保留/可重试）见 core/rooms/privateRoomRpc.ts。
 */
import { handleRoomResolve } from "../../core/rooms/privateRoomRpc";
import { defineRpc } from "../rpc";

export default defineRpc("room.resolve", {
  handler: (ctx, payload) => handleRoomResolve(ctx.uid, payload),
});
