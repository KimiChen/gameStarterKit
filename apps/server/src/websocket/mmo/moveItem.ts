/**
 * mmo.moveItem——移动 / 装备一件（幂等写：clientReqId 重放先由 dispatcher idem 层返回首次结果；越过缓存的重放由 k_mmo_receipt 兜底，inventory 面 moveItem 抬头）。
 * 角色不属本账号 ⇒ MMO_INVENTORY_FORBIDDEN；规则拒绝（槽位类型 / 职业 / 堆叠 / 被占 / 并发冲突 …）⇒ MMO_INVENTORY_REJECTED（message 带 code）。
 */
import { MmoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmo";
import { RpcFault } from "../../core/infra/kitApi";
import { MmoInventoryError, moveItemFor } from "../../kits/mmo/api/inventory/index";
import { currentZoneId, mmoOpId } from "../../kits/mmo/host";
import { defineRpc } from "../rpc";

export default defineRpc(MmoRpc.MoveItem, {
  handler: async (ctx, p) => {
    const sId = currentZoneId();
    try {
      const outcome = await moveItemFor(ctx.uid, sId, { characterId: p.characterId, itemInstanceId: p.itemInstanceId, location: p.location, slot: p.slot }, mmoOpId(ctx.uid, sId, "moveItem", p.clientReqId));
      return { bag: outcome.bag };
    } catch (error) {
      if (error instanceof MmoInventoryError) {
        if (error.code === "forbidden") throw new RpcFault("MMO_INVENTORY_FORBIDDEN", `角色 ${p.characterId} 不属于本账号`);
        throw new RpcFault("MMO_INVENTORY_REJECTED", `${error.code}${error.detail ? `：${error.detail}` : ""}`);
      }
      throw error;
    }
  },
});
