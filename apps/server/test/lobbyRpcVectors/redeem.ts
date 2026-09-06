/** redeem 域测试向量（插件 plugins/redeem 自带；随 codegen:plugins 汇入 index.generated.ts）。 */
import { RedeemRpc } from "@game/shared/protocol/lobbyRpc/domains/redeem";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [RedeemRpc.Claim]: {
    request: { clientReqId: "c1", code: "WELCOME2026" },
    response: { code: "WELCOME2026", reward: { kind: "coins", amount: 100 }, balance: 100 },
  },
} satisfies LobbyRpcVectorFile;
