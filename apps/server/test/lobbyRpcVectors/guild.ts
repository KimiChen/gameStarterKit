/** guild 域测试向量（自 wire-contract requestFixtures/responseFixtures 与 lobby-rpc-contract validPayloads 迁移合一）。 */
import { GuildRpc } from "@game/shared";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [GuildRpc.Join]: {
    request: { clientReqId: "c1", guildId: 1 },
    response: { ok: true, seq: 1 },
  },
  [GuildRpc.Leave]: {
    request: { clientReqId: "c1" },
    response: { ok: true },
  },
  [GuildRpc.GetEvents]: {
    request: { sinceSeq: 0 },
    response: { events: [], latestSeq: 0, guildId: 0 },
  },
} satisfies LobbyRpcVectorFile;
