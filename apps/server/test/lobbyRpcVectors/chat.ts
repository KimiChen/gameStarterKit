/** chat 域测试向量（MMO MF6a-B4）。natural-write：⛔ 无 clientReqId。 */
import { ChatRpc } from "@game/shared/protocol/lobbyRpc/domains/chat";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [ChatRpc.Send]: { request: { channel: "realm:1", text: "hello" }, response: { msgId: "m1", at: 1_700_000_000_000 } },
} satisfies LobbyRpcVectorFile;
