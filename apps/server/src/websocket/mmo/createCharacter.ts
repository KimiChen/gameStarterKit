/**
 * mmo.createCharacter——建角（幂等写：clientReqId 重放先由 dispatcher idem 层返回首次结果；越过缓存的重放由 kit 回执表 k_mmo_receipt 兜底，
 * characters 面 createCharacter 抬头）。名字撞 ⇒ MMO_NAME_TAKEN；槽位已有 ⇒ MMO_SLOT_TAKEN；满 ⇒ MMO_SLOTS_FULL。
 */
import { MmoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmo";
import { RpcFault } from "../../core/infra/kitApi";
import { MmoNameTakenError, MmoSlotTakenError, MmoSlotsFullError, createCharacter } from "../../kits/mmo/api/characters/index";
import { currentZoneId, mmoOpId } from "../../kits/mmo/host";
import { defineRpc } from "../rpc";

export default defineRpc(MmoRpc.CreateCharacter, {
  handler: async (ctx, p) => {
    const sId = currentZoneId();
    try {
      const outcome = await createCharacter(ctx.uid, sId, { slot: p.slot, name: p.name, classId: p.classId, factionId: p.factionId }, mmoOpId(ctx.uid, sId, "createCharacter", p.clientReqId));
      return { character: outcome.character };
    } catch (error) {
      if (error instanceof MmoNameTakenError) throw new RpcFault("MMO_NAME_TAKEN", `角色名 "${error.characterName}" 已被占用`);
      if (error instanceof MmoSlotTakenError) throw new RpcFault("MMO_SLOT_TAKEN", `槽位 ${error.slot} 已有角色`);
      if (error instanceof MmoSlotsFullError) throw new RpcFault("MMO_SLOTS_FULL", `角色数已达上限 ${error.max}`);
      throw error;
    }
  },
});
