/** world 域测试向量（MMO MF8-B4：enter / resolveTransfer 的最小合法 request/response 向量 sidecar）。 */
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  "world.enter": {
    request: { personaId: "p_alice_0000000001", mapId: "m1" },
    response: { worldAddress: "s0/m1/0", mapId: "m1", line: 0, endpoint: "", ticket: "t".repeat(43), expiresAt: 0, transferId: null },
  },
  "world.resolveTransfer": {
    request: { transferId: "wt_0123456789abcdef0123456789abcdef" },
    response: { worldAddress: "s0/m2/0", mapId: "m2", line: 0, endpoint: "wss://world.example.com", ticket: "t".repeat(43), expiresAt: 0, transferId: "wt_0123456789abcdef0123456789abcdef" },
  },
} satisfies LobbyRpcVectorFile;
