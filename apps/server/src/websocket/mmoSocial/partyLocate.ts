/** mmoSocial.partyLocate——本账号某角色所在队伍的成员定位（query；social 面 partyOf）。角色不属本账号 ⇒ MMO_SOCIAL_CHARACTER_FORBIDDEN。 */
import { MmoSocialRpc } from "@game/shared/protocol/lobbyRpc/domains/mmoSocial";
import { RpcFault } from "../../core/infra/kitApi";
import { MmoSocialForbiddenError, partyOf } from "../../kits/mmo/api/social/index";
import { currentZoneId } from "../../kits/mmo/host";
import { defineRpc } from "../rpc";

export default defineRpc(MmoSocialRpc.PartyLocate, {
  handler: async (ctx, p) => {
    try {
      return { party: await partyOf(ctx.uid, currentZoneId(), p.characterId) };
    } catch (error) {
      if (error instanceof MmoSocialForbiddenError) throw new RpcFault("MMO_SOCIAL_CHARACTER_FORBIDDEN", `角色 ${error.characterId} 不属于本账号`);
      throw error;
    }
  },
});
