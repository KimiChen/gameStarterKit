/**
 * arena kit · `ranking` api 面（服务端，docs/KIT.md §4）：按主人聚合的棋盘排名。
 * 棋盘只有 ARENA_TILE_COUNT 格，读整表后交给 shared ranking 面的纯函数聚合（⛔ 不在 SQL 里 GROUP BY / LIMIT：
 * 排序规则只在 shared 一处）。本面任何导出变化都要 bump `apps/kits/arena/kit.json` 的 `api.ranking.version`。
 */
import { type IArenaOwnerRank, rankOwners } from "@game/shared/kits/arena/api/ranking/index";
import { type ArenaTxRunner, createArenaBoardApi, defaultArenaTxRunner } from "../board/index";

export const ARENA_RANKING_DEFAULT_LIMIT = 10;

export function createArenaRankingApi(run: ArenaTxRunner = defaultArenaTxRunner) {
  const board = createArenaBoardApi(run);
  return {
    /** 前 `limit` 名主人（格数降序 → 守备和降序 → uid 升序）。 */
    async topOwners(sId: number, limit: number = ARENA_RANKING_DEFAULT_LIMIT): Promise<IArenaOwnerRank[]> {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError(`arena ranking limit ${String(limit)} 非法`);
      return rankOwners(await board.readBoard(sId)).slice(0, limit);
    },
  };
}

const defaultApi = createArenaRankingApi();
export const topOwners: ReturnType<typeof createArenaRankingApi>["topOwners"] = (sId, limit) => defaultApi.topOwners(sId, limit);
