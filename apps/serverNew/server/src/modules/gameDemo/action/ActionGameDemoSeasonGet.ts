import { millisecond } from '@arthropoda/game-engine'
import type {
    IGameDemoEmptyReq,
    IGameDemoSeason,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoSeason } from '../bean/GameDemoSeason'
import { GameDemoLeaderboard } from '../rules/GameDemoLeaderboard'
import { ActionGameDemo } from './ActionGameDemo'

/** 活动是共享资源；查询只读，不进入活动串行组。 */
export class ActionGameDemoSeasonGet extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoSeason): Promise<void> {
        const season = await GameDemoSeason.loadOnlyRead(1)
        if (!season?.number) throw { code: 'GAME_DEMO_SEASON_PENDING', msg: '活动准备中，请稍后刷新' }
        const view = GameDemoLeaderboard.view(season, this.requireUser().id, millisecond())
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
