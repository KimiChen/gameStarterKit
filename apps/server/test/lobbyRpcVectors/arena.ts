/** arena 域测试向量（kits/arena 自带；随 codegen:plugins 汇入 index.generated.ts）。 */
import { ArenaRpc } from "@game/shared/protocol/lobbyRpc/domains/arena";
import { ARENA_TILE_COUNT } from "@game/shared/kits/arena/api/board/index";
import type { LobbyRpcVectorFile } from "./vectorTypes";

const tiles = Array.from({ length: ARENA_TILE_COUNT }, (_item, tile) => (
  tile === 3 ? { tile, ownerUid: "u1", power: 2 } : { tile, ownerUid: "", power: 0 }
));

export default {
  [ArenaRpc.Board]: {
    request: {},
    response: { tiles, myTrophies: 1 },
  },
  [ArenaRpc.Capture]: {
    request: { clientReqId: "c1", tile: 3 },
    response: { tile: 3, power: 1, trophies: 1 },
  },
} satisfies LobbyRpcVectorFile;
