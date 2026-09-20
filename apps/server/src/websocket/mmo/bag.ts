/** mmo.bag——本账号某角色的背包视图（query；inventory 面 bagOf）。角色不属本账号 ⇒ MMO_INVENTORY_FORBIDDEN。 */
import { MmoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmo";
import { RpcFault } from "../../core/infra/kitApi";
import { MmoInventoryError, bagOf } from "../../kits/mmo/api/inventory/index";
import { currentZoneId } from "../../kits/mmo/host";
import { defineRpc } from "../rpc";

export default defineRpc(MmoRpc.Bag, {
  handler: async (ctx, p) => {
    try {
      return { bag: await bagOf(ctx.uid, currentZoneId(), p.characterId) };
    } catch (error) {
      if (error instanceof MmoInventoryError && error.code === "forbidden") throw new RpcFault("MMO_INVENTORY_FORBIDDEN", `角色 ${p.characterId} 不属于本账号`);
      throw error;
    }
  },
});
