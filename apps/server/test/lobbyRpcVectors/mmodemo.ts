/** mmodemo 域测试向量（插件 plugins/mmodemo 自带；随 codegen:plugins 汇入 index.generated.ts）。 */
import { MmoDemoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmodemo";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [MmoDemoRpc.BossBoard]: {
    request: {},
    response: {
      mapId: "demoVale",
      packId: "demoVale",
      lines: [
        { instanceId: "wi_0123456789abcdef", rev: 12, tick: 2400, bossKills: 3 },
        { instanceId: "wi_fedcba9876543210", rev: 0, tick: 0, bossKills: 0 },
      ],
      totalKills: 3,
    },
  },
} satisfies LobbyRpcVectorFile;
