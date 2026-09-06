/**
 * arena.board——整张棋盘 + 本人奖杯数（只读）。棋盘经 kit 的 board 面（withKitTx 内 SELECT），
 * 奖杯经 kit 内部 host.ts → kit-api `readKitUserField` 的只读 HGET（写侧只有 outbox effect，见 docs/KIT.md §5）。
 */
import { ArenaRpc } from "@game/shared/protocol/lobbyRpc/domains/arena";
import { readBoard } from "../../kits/arena/api/board/index";
import { currentZoneId, readArenaTrophies } from "../../kits/arena/host";
import { defineRpc } from "../rpc";

export default defineRpc(ArenaRpc.Board, {
  handler: async (ctx) => {
    const sId = currentZoneId();
    const [tiles, myTrophies] = await Promise.all([readBoard(sId), readArenaTrophies(ctx.uid)]);
    return { tiles, myTrophies };
  },
});
