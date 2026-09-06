/** arenaShop 域测试向量（插件 plugins/arenaShop 自带；随 codegen:plugins 汇入 index.generated.ts）。 */
import { ArenaShopRpc } from "@game/shared/protocol/lobbyRpc/domains/arenaShop";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [ArenaShopRpc.BuyBoost]: {
    request: { clientReqId: "c1", tile: 3 },
    response: { tile: 3, power: 6, balance: 90 },
  },
} satisfies LobbyRpcVectorFile;
