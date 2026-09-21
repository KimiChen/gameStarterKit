import { MmoHoldRpc } from "@game/shared/protocol/lobbyRpc/domains/mmohold";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [MmoHoldRpc.Standings]: {
    request: {},
    response: {
      mapId: "holdRidge", packId: "holdRidge",
      lines: [
        { instanceId: "wi_0123456789abcdef", rev: 12, tick: 2400, scores: { dawn: 24, dusk: 15 }, owners: { pointA: "dawn", pointB: "dusk" } },
        { instanceId: "wi_fedcba9876543210", rev: 0, tick: 0, scores: { dawn: 0, dusk: 0 }, owners: { pointA: "neutral", pointB: "neutral" } },
      ],
      totalScores: { dawn: 24, dusk: 15 },
    },
  },
} satisfies LobbyRpcVectorFile;
