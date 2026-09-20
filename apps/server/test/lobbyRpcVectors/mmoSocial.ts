/** mmoSocial 域测试向量（kits/mmo 自带；随 codegen:plugins 汇入 index.generated.ts）。 */
import { MmoSocialRpc } from "@game/shared/protocol/lobbyRpc/domains/mmoSocial";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [MmoSocialRpc.PartyLocate]: {
    request: { characterId: "c1" },
    response: {
      party: {
        partyId: 7, ver: 3,
        members: [
          { uid: "u-a", characterId: "c1", name: "Rook", personaId: "p1", worldAddress: "s0/greybox/0", mapId: "greybox", online: true, leader: true },
          { uid: "u-b", characterId: "c2", name: "Bee", personaId: "p2", worldAddress: null, mapId: null, online: false, leader: false },
          { uid: "u-c", characterId: null, name: null, personaId: null, worldAddress: null, mapId: null, online: true, leader: false },
        ],
      },
    },
  },
} satisfies LobbyRpcVectorFile;
