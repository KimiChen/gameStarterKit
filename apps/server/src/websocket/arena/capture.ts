/**
 * arena.capture——占领 / 加固 / 夺取一格（幂等写：clientReqId 重放先由 dispatcher idem 层返回首次结果；越过缓存
 * （60s 后 / 结果缓存不可得）的重放由 kit 自己的回执表 k_arena_attempt 兜底——三种结果都原样回读、零写入，
 * 见 board 面 captureTile 抬头）。敌格仍有守备 ⇒ ARENA_TILE_TAKEN（该格已 −1 守备并提交；重放不再削）。
 */
import { ArenaRpc } from "@game/shared/protocol/lobbyRpc/domains/arena";
import { RpcFault } from "../../core/infra/kitApi";
import { arenaOpId, captureTile } from "../../kits/arena/api/board/index";
import { currentZoneId, readArenaTrophies } from "../../kits/arena/host";
import { defineRpc } from "../rpc";

export default defineRpc(ArenaRpc.Capture, {
  handler: async (ctx, p) => {
    const sId = currentZoneId();
    const outcome = await captureTile(ctx.uid, sId, p.tile, arenaOpId(ctx.uid, sId, "capture", p.clientReqId));
    if (outcome.kind === "taken") {
      throw new RpcFault("ARENA_TILE_TAKEN", `arena 格 ${outcome.tile} 仍由 "${outcome.ownerUid}" 守备（剩余 ${outcome.power}）`);
    }
    return { tile: outcome.tile, power: outcome.power, trophies: await readArenaTrophies(ctx.uid) };
  },
});
