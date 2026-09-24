import type { ReqGameDemoSeasonScore } from '../GameDemoS2S'
import { GameDemoSeason } from '../bean/GameDemoSeason'
import { GameDemoLeaderboard } from '../rules/GameDemoLeaderboard'
import type { GameDemoResource } from '../rules/GameDemoTaskGroups'
import { ActionGameDemoTask } from './ActionGameDemoTask'

/** 计入一批炼丹积分；只接受本期窗口内提交的批次，重复投递按 `uid:batchId` 去重。 */
export class ActionGameDemoSeasonScore extends ActionGameDemoTask {
    protected readonly resource: GameDemoResource = 'season'

    async doAction(req: ReqGameDemoSeasonScore): Promise<void> {
        const season = await GameDemoSeason.load(1)
        if (!season) return
        GameDemoLeaderboard.applyScore(season, req.uid, req.batchId, req.score, req.at)
    }
}
