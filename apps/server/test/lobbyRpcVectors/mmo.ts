/** mmo 域测试向量（kits/mmo 自带；随 codegen:plugins 汇入 index.generated.ts）。 */
import { MmoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmo";
import { MAX_CHARACTER_SLOTS } from "@game/shared/kits/mmo/api/characters/index";
import type { LobbyRpcVectorFile } from "./vectorTypes";

const character = {
  characterId: "c1", personaId: "p1", slot: 0, name: "Rook", classId: "fighter", factionId: "dawn", level: 1, exp: 0, mapId: null, status: "active",
} as const;

export default {
  [MmoRpc.Characters]: {
    request: {},
    response: { characters: [character], orphans: [{ personaId: "p9", slot: 3 }], maxSlots: MAX_CHARACTER_SLOTS },
  },
  [MmoRpc.CreateCharacter]: {
    request: { clientReqId: "c1", slot: 0, name: "Rook", classId: "fighter", factionId: "dawn" },
    response: { character },
  },
} satisfies LobbyRpcVectorFile;
