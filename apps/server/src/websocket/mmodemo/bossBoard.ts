/** mmodemo.bossBoard——灰谷各分线头狼击杀战报（query；kit orchestration 面 v2 listCheckpointedVars，只读）。 */
import { MmoDemoRpc } from "@game/shared/protocol/lobbyRpc/domains/mmodemo";
import { readBossBoard } from "../../core/mmodemo/bossBoard";
import { defineRpc } from "../rpc";

export default defineRpc(MmoDemoRpc.BossBoard, {
  handler: () => readBossBoard(),
});
