/** 最新检查点战况；只经 kit orchestration 公共面读，不直接访问 kit 表或世界实例。 */
import {
  MMO_HOLD_MAP_ID, MMO_HOLD_PACK_ID, MMO_HOLD_STANDINGS_MAX_SCORE,
  type IMmoHoldStandingsLine, type IMmoHoldStandingsRes, type MmoHoldOwner,
} from "@game/shared/protocol/lobbyRpc/domains/mmohold";
import { currentZoneId } from "../infra/keys";
import { listCheckpointedVars } from "../../kits/mmo/api/orchestration/index";

export interface StandingsDeps {
  readonly listCheckpointedVars: typeof listCheckpointedVars;
  readonly currentZoneId: () => number;
}
const DEFAULT_DEPS: StandingsDeps = { listCheckpointedVars, currentZoneId };

/** 缺失或坏检查点值按 0 展示；上限保证整页分数相加不丢精度。 */
export function scoreOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MMO_HOLD_STANDINGS_MAX_SCORE ? value : 0;
}

export function ownerOf(value: unknown): MmoHoldOwner {
  return value === "dawn" || value === "dusk" ? value : "neutral";
}

export async function readStandings(deps: StandingsDeps = DEFAULT_DEPS): Promise<IMmoHoldStandingsRes> {
  const rows = await deps.listCheckpointedVars(deps.currentZoneId(), MMO_HOLD_MAP_ID, MMO_HOLD_PACK_ID);
  const lines: IMmoHoldStandingsLine[] = rows.map((row) => ({
    instanceId: row.instanceId, rev: row.rev, tick: row.tick,
    scores: { dawn: scoreOf(row.vars["score:dawn"]), dusk: scoreOf(row.vars["score:dusk"]) },
    owners: { pointA: ownerOf(row.vars["owner:pointA"]), pointB: ownerOf(row.vars["owner:pointB"]) },
  }));
  return {
    mapId: MMO_HOLD_MAP_ID, packId: MMO_HOLD_PACK_ID, lines,
    totalScores: lines.reduce((sum, line) => ({ dawn: sum.dawn + line.scores.dawn, dusk: sum.dusk + line.scores.dusk }), { dawn: 0, dusk: 0 }),
  };
}
