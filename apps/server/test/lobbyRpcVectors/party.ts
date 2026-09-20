/** party 域测试向量（MMO MF6a-B3）。 */
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [PartyRpc.Create]: { request: { clientReqId: "p1" }, response: { partyId: 1, seq: 1 } },
  [PartyRpc.Invite]: { request: { clientReqId: "p2", uid: "u2" }, response: { ok: true, seq: 2, expAt: 1_700_000_120_000 } },
  [PartyRpc.Accept]: { request: { clientReqId: "p3", partyId: 1 }, response: { ok: true, seq: 3 } },
  [PartyRpc.Decline]: { request: { clientReqId: "p4", partyId: 1 }, response: { ok: true } },
  [PartyRpc.Leave]: { request: { clientReqId: "p5" }, response: { ok: true, disbanded: false } },
  [PartyRpc.Kick]: { request: { clientReqId: "p6", uid: "u2" }, response: { ok: true, seq: 4 } },
  [PartyRpc.TransferLeader]: { request: { clientReqId: "p7", uid: "u2" }, response: { ok: true, seq: 5 } },
  [PartyRpc.Get]: {
    request: {},
    response: { party: { partyId: 1, leader: "u1", maxSize: 5, ver: 3, members: [{ uid: "u1", joinedAt: 1_700_000_000_000, online: true }] } },
  },
  [PartyRpc.GetEvents]: { request: { sinceSeq: 0 }, response: { events: [], latestSeq: 0, partyId: 0 } },
} satisfies LobbyRpcVectorFile;
