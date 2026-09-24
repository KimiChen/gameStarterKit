import { millisecond } from '@arthropoda/game-engine'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { GameRandom } from '../../../runtime/random/GameRandom'
import type {
    IGameDemoAlchemyStartReq,
    IGameDemoAlchemyState,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoAlchemy } from '../rules/GameDemoAlchemy'
import { GameDemoInventory } from '../rules/GameDemoInventory'
import { ActionGameDemo } from './ActionGameDemo'
import { ActionGameDemoSeasonScore } from './ActionGameDemoSeasonScore'

/**
 * 炼丹提交即结算：扣材料、产出丹药并记下本批积分；积分经可靠队列投递到活动所在 Task Worker。
 *
 * 投递在 Bean 提交成功后登记。为弥补「提交后、登记前」进程崩溃的窗口，每次炼丹都会按玩家 Bean 里
 * 保存的上一批重新登记一次（同一 taskId 幂等），活动侧再按 `uid:batchId` 去重。
 */
export class ActionGameDemoAlchemyStart extends ActionGameDemo {
    async doAction(req: IGameDemoAlchemyStartReq, res: IGameDemoAlchemyState): Promise<void> {
        const player = await this.requirePlayer()
        if (player.batchSeq) await ActionGameDemoAlchemyStart.postScore(player)
        GameDemoAlchemy.start(player, req.count, millisecond(), () => GameRandom.rand(0, 99))
        await ActionGameDemoAlchemyStart.postScore(player)
        res.assets = GameDemoInventory.assets(this.requireUser(), player)
        res.batch = GameDemoAlchemy.view(player)
    }

    private static async postScore(player: GameDemoPlayer): Promise<void> {
        await QueuedLocalAction.rpc(
            ActionGameDemoSeasonScore,
            { uid: player.id, batchId: player.batchSeq, score: player.batchScore, at: player.batchStartedAt },
            player.id,
            SERVER_ID,
            0,
            { taskId: `gameDemo:score:${player.id}:${player.batchSeq}` },
        )
    }
}
