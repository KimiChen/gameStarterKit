/** room 域测试向量（§5.6/§6.8：prepareCreate/resolve 的最小合法 request/response 向量 sidecar）。 */
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  "room.prepareCreate": {
    request: { clientReqId: "c1", mode: "privateFixture", modeVersion: 1, profile: "private" },
    response: { creationTicket: "t".repeat(43), expiresAt: 0 },
  },
  "room.resolve": {
    request: { code: "000001" },
    response: {
      roomId: "r1",
      mode: "privateFixture",
      modeVersion: 1,
      profile: "private",
      joinTicket: "t".repeat(43),
      expiresAt: 0,
    },
  },
} satisfies LobbyRpcVectorFile;
