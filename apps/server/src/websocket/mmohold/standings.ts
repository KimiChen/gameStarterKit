/** mmohold.standings：据点战当前轮次的检查点比分（只读 query）。 */
import { MmoHoldRpc } from "@game/shared/protocol/lobbyRpc/domains/mmohold";
import { readStandings } from "../../core/mmohold/standings";
import { defineRpc } from "../rpc";

export default defineRpc(MmoHoldRpc.Standings, { handler: () => readStandings() });
