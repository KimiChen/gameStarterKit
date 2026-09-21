/**
 * mmodemo.bossBoard 用例（MG1-B2 可选域页面）：读 demoVale 各分线最新检查点里编排 durable var `bossKills`（kit orchestration 面 v2
 * `listCheckpointedVars`：k_mmo_instance 按 map / pack 列分线 → 各取最新检查点的 pack vars）。插件 ⛔ 碰 kit 表 / 框架 world_instance、
 * ⛔ import kit 内部模块；非数值 / 负数 / 非整数的 var ⇒ 0（fail-soft：战报只展示，⛔ 因一条坏 var 整页失败）。
 * `deps` 只给单测注入（假 kit 面 / 假区号），生产缺省即真实实现。
 */
import { MMO_DEMO_MAP_ID, MMO_DEMO_PACK_ID, type IMmoDemoBossBoardLine, type IMmoDemoBossBoardRes } from "@game/shared/protocol/lobbyRpc/domains/mmodemo";
import { currentZoneId } from "../infra/keys";
import { listCheckpointedVars } from "../../kits/mmo/api/orchestration/index";
import { BOSS_KILLS_VAR } from "./encounters/bossTimer";

export interface BossBoardDeps {
  readonly listCheckpointedVars: typeof listCheckpointedVars;
  readonly currentZoneId: () => number;
}

const DEFAULT_DEPS: BossBoardDeps = { listCheckpointedVars, currentZoneId };

/** durable var → 击杀数：只认 ≥ 0 的安全整数，其余（缺失 / 字符串 / 负数 / 小数）⇒ 0。 */
export function bossKillsOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function readBossBoard(deps: BossBoardDeps = DEFAULT_DEPS): Promise<IMmoDemoBossBoardRes> {
  const rows = await deps.listCheckpointedVars(deps.currentZoneId(), MMO_DEMO_MAP_ID, MMO_DEMO_PACK_ID);
  const lines: IMmoDemoBossBoardLine[] = rows.map((row) => ({ instanceId: row.instanceId, rev: row.rev, tick: row.tick, bossKills: bossKillsOf(row.vars[BOSS_KILLS_VAR]) }));
  return { mapId: MMO_DEMO_MAP_ID, packId: MMO_DEMO_PACK_ID, lines, totalKills: lines.reduce((sum, line) => sum + line.bossKills, 0) };
}
