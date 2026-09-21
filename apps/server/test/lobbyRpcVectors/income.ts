/** income 域测试向量（随 codegen:plugins 汇入 index.generated.ts）。等级 3 → 每周期 334 铜币。 */
import { IncomeRpc } from "@game/shared/protocol/lobbyRpc/domains/income";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [IncomeRpc.GetPending]: {
    request: {},
    response: { level: 3, intervalSeconds: 5, perInterval: 334, offlineSeconds: 120, offlineCopper: 8016, copper: 1000 },
  },
  [IncomeRpc.SettleOnline]: {
    request: {},
    response: { copper: 334, balance: 1334 },
  },
  [IncomeRpc.ClaimOffline]: {
    request: { clientReqId: "c1" },
    response: { copper: 8016, offlineSeconds: 120, balance: 9016 },
  },
} satisfies LobbyRpcVectorFile;
