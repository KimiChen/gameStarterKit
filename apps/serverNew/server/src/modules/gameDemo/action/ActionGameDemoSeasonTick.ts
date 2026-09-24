import { millisecond } from '@arthropoda/game-engine'
import { GameDemoSeason } from '../bean/GameDemoSeason'
import { GameDemoLeaderboard } from '../rules/GameDemoLeaderboard'
import type { GameDemoResource } from '../rules/GameDemoTaskGroups'
import { ActionGameDemoTask } from './ActionGameDemoTask'

/** 每秒推进活动；定榜后到下一期开启前，每次推进都幂等登记前三名奖励。 */
export class ActionGameDemoSeasonTick extends ActionGameDemoTask {
    protected readonly resource: GameDemoResource = 'season'

    async doAction(): Promise<void> {
        const season = await ActionGameDemoTask.loadOrCreate(GameDemoSeason)
        GameDemoLeaderboard.tick(season, millisecond())
        if (season.phase === 'settled') await this.postRewards(season.rewards!.values())
    }
}
