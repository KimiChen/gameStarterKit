/** user 域测试向量（自 wire-contract requestFixtures/responseFixtures 与 lobby-rpc-contract validPayloads 迁移合一）。 */
import { UserRpc } from "@game/shared";
import type { LobbyRpcVectorFile } from "./vectorTypes";

export default {
  [UserRpc.GetUserId]: {
    request: {},
    response: { uid: "u1" },
  },
  [UserRpc.GetInfo]: {
    request: {},
    response: { user: { uid: "u1", star: 0, maxRound: 0, wins: 0, losses: 0, stamina: 30, lastStaminaRecoverAt: 0, musicOn: true, sfxOn: true, guildId: 0, ver: 1 } },
  },
  [UserRpc.GetProfile]: {
    request: { uid: "u1" },
    response: { profile: null },
  },
  [UserRpc.UpdateProfile]: {
    request: { clientReqId: "c1", nickname: "n", avatarId: 1, province: "p", musicOn: true, sfxOn: false },
    response: { ok: true },
  },
} satisfies LobbyRpcVectorFile;
