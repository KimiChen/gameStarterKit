import type { ApiCall, Hash, IActionLogic } from '@arthropoda/game-engine'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import type { GameDemoRewardBean } from '../bean/GameDemoRewardBean'
import { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoTaskGroups, type GameDemoResource } from '../rules/GameDemoTaskGroups'
import { ActionGameDemoMailDeliver } from './ActionGameDemoMailDeliver'

/**
 * gameDemo 共享资源（活动、仙盟、Boss）Action 的公共入口：在 Task Worker 上按资源串行。
 *
 * - 子类用 `resource` 声明所属资源；同一资源的所有入口返回相同的 taskGroupId / bindId。
 * - Task Worker 不得提交玩家 Bean，所以这里不走 `ActionUser.actionBefore`（它会加载 `User` 并执行
 *   每日重置）；读取玩家数据只用 `loadOnlyRead`，写回玩家一律经可靠队列投递到玩家 Owner。
 */
export abstract class ActionGameDemoTask implements IActionLogic {
    protected abstract readonly resource: GameDemoResource

    /** 发起请求的玩家（后台 tick 为 0）。 */
    protected uid = 0

    async getTaskGroupId(): Promise<number> {
        return GameDemoTaskGroups.taskGroupId(this.resource)
    }

    async getBindId(): Promise<number> {
        return GameDemoTaskGroups.bindId(this.resource)
    }

    async actionBefore(call: ApiCall): Promise<void> {
        this.uid = call.uId
    }

    abstract doAction(req: unknown, res: unknown): Promise<void>

    /** 本区服单例 / 按序号的共享 Bean：首次写入时创建。 */
    protected static async loadOrCreate<T extends Hash & { id: number }>(
        beanClass: (new (id: number) => T) & typeof Hash,
        id = 1,
    ): Promise<T> {
        const loaded = await beanClass.load<T>(id)
        if (loaded) return loaded
        const created = new beanClass(id)
        created.id = id
        return created
    }

    protected async isInitialized(uid: number): Promise<boolean> {
        return (await GameDemoPlayer.loadOnlyRead(uid))?.initialized === true
    }

    /**
     * 奖励经可靠队列投递到各玩家 Owner：登记在提交成功后执行；按来源派生的 taskId 与邮箱的来源去重
     * 共同保证重复登记只入箱一次。调用方在奖励仍保留期间每次推进都重新登记，弥补进程在提交后、
     * 登记前崩溃的窗口。
     */
    protected async postRewards(rewards: Iterable<GameDemoRewardBean>): Promise<void> {
        for (const reward of rewards) {
            await QueuedLocalAction.rpc(
                ActionGameDemoMailDeliver,
                { source: reward.source, title: reward.title, gold: reward.gold },
                reward.uid,
                SERVER_ID,
                0,
                { taskId: `gameDemo:${reward.source}` },
            )
        }
    }
}
