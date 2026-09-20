/** mmo.characters——本账号本区的角色列表 + 孤儿 persona（query；characters 面 listCharacters）。 */
import { MmoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmo";
import { MAX_CHARACTER_SLOTS } from "@game/shared/kits/mmo/api/characters/index";
import { listCharacters } from "../../kits/mmo/api/characters/index";
import { currentZoneId } from "../../kits/mmo/host";
import { defineRpc } from "../rpc";

export default defineRpc(MmoRpc.Characters, {
  handler: async (ctx) => {
    const listing = await listCharacters(ctx.uid, currentZoneId());
    return { characters: [...listing.characters], orphans: [...listing.orphans], maxSlots: MAX_CHARACTER_SLOTS };
  },
});
