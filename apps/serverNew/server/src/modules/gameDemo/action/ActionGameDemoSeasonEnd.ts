import { millisecond } from '@arthropoda/game-engine'
import type {
    IGameDemoSeason,
    IGameDemoSeasonEndReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoSeason } from '../bean/GameDemoSeason'
import { GameDemoLeaderboard } from '../rules/GameDemoLeaderboard'
import type { GameDemoResource } from '../rules/GameDemoTaskGroups'
import { ActionGameDemo } from './ActionGameDemo'
import { ActionGameDemoTask } from './ActionGameDemoTask'

/** 开发入口：提前截止本期活动。写活动 Bean，所以在活动串行组内执行。 */
export class ActionGameDemoSeasonEnd extends ActionGameDemoTask {
    protected readonly resource: GameDemoResource = 'season'

    async doAction(req: IGameDemoSeasonEndReq, res: IGameDemoSeason): Promise<void> {
        if (!ActionGameDemo.devToolsEnabled()) throw { code: 'GAME_DEMO_DEV_DISABLED', msg: '开发入口未开放' }
        const season = await GameDemoSeason.load(1)
        if (!season?.number) throw { code: 'GAME_DEMO_SEASON_PENDING', msg: '活动准备中，请稍后刷新' }
        const now = millisecond()
        GameDemoLeaderboard.end(season, req.number, now)
        const view = GameDemoLeaderboard.view(season, this.uid, now)
        res.number = view.number
        res.phase = view.phase
        res.startedAt = view.startedAt
        res.endsAt = view.endsAt
        res.serverNow = view.serverNow
        res.top = view.top
        res.myScore = view.myScore
        res.myRank = view.myRank
        res.rewardedCount = view.rewardedCount
    }
}
