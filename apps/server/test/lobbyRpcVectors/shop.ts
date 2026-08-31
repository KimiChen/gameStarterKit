/** shop 域测试向量（自 wire-contract requestFixtures/responseFixtures 与 lobby-rpc-contract validPayloads 迁移合一）。 */
import { ShopRpc } from "@game/shared";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [ShopRpc.Purchase]: {
    request: { clientReqId: "c1", sku: "sku1" },
    response: { opId: "op1", status: "done", balance: 10, granted: [{ kind: "item", itemId: 1, count: 1 }] },
  },
  [ShopRpc.QueryOp]: {
    request: { opId: "op1" },
    response: { opId: "op1", status: "done", balance: 10, granted: [{ kind: "item", itemId: 1, count: 1 }] },
  },
} satisfies LobbyRpcVectorFile;
