import { GameAction } from '../../../runtime/action/GameAction'
import type { User } from '../../user/bean/User'
import { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoInventory } from '../rules/GameDemoInventory'

/**
 * gameDemo 玩家 Action 的公共入口。
 *
 * 不声明 `taskGroupId` / `bindId`：由玩家 Owner（Event Worker）执行，默认按可信 uid 串行，
 * 玩家 Bean 与宿主 `User` 在同一次 `RedisTask` 中提交，并经 ModSync 同步给本人。
 */
export class ActionGameDemo extends GameAction {
    /** 测试资源只在宿主进程显式设置 `GAME_DEMO_DEV_TOOLS=1` 时开放。 */
    static devToolsEnabled(): boolean {
        return process.env.GAME_DEMO_DEV_TOOLS === '1'
    }

    /** 原生建档链保证已认证玩家都有 `User` 档；缺档是宿主异常，不能静默返回空数据。 */
    protected requireUser(): User {
        if (!this.user) throw { code: 'GAME_DEMO_USER_UNAVAILABLE', msg: '玩家档案未就绪' }
        return this.user
    }

    /** 只读路由不建档：玩家未开放玩法时返回 undefined，由视图给出默认值。 */
    protected async loadPlayer(): Promise<GameDemoPlayer | undefined> {
        return GameDemoPlayer.load(this.requireUser().id)
    }

    protected async requirePlayer(): Promise<GameDemoPlayer> {
        const player = await this.loadPlayer()
        GameDemoInventory.requireInitialized(player)
        return player!
    }

    protected async loadOrCreatePlayer(): Promise<GameDemoPlayer> {
        const uid = this.requireUser().id
        const existing = await GameDemoPlayer.load(uid)
        if (existing) return existing
        const player = new GameDemoPlayer(uid)
        player.id = uid
        return player
    }
}
