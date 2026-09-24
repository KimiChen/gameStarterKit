import { millisecond } from '@arthropoda/game-engine'
import {
    GAME_DEMO_CONFIG,
    type GameDemoBossId,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type { IGameDemoBossState } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoBossLobby } from '../bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../bean/GameDemoBossRoom'
import { GameDemoPlayer } from '../bean/GameDemoPlayer'
import { GameDemoBossBattle } from '../rules/GameDemoBossBattle'
import { GameDemoHeroTraining } from '../rules/GameDemoHeroTraining'
import type { GameDemoResource } from '../rules/GameDemoTaskGroups'
import { ActionGameDemoTask } from './ActionGameDemoTask'

/** 击杀后重复登记奖励的时长；覆盖提交与登记之间的崩溃窗口即可，不必持续到换局。 */
const REWARD_REPOST_MS = 5000

/**
 * Boss 写入的公共入口：大厅与三个房间在同一个 Boss 串行组内加载与修改。
 *
 * 房间变化提交后，框架按 `addNotifyUids` 登记的在线参与者推送 sync 帧；击杀后的一小段时间内
 * 每次写入都幂等登记奖励，弥补提交与登记之间的崩溃窗口。
 */
export abstract class ActionGameDemoBoss extends ActionGameDemoTask {
    protected readonly resource: GameDemoResource = 'boss'

    static async heroAttack(uid: number): Promise<number> {
        return GameDemoHeroTraining.view(await GameDemoPlayer.loadOnlyRead(uid)).attack
    }

    protected async lobby(): Promise<GameDemoBossLobby> {
        return ActionGameDemoTask.loadOrCreate(GameDemoBossLobby)
    }

    protected async room(bossId: GameDemoBossId): Promise<GameDemoBossRoom> {
        const room = await ActionGameDemoTask.loadOrCreate(GameDemoBossRoom, GameDemoBossBattle.roomId(bossId))
        if (!room.runNumber) GameDemoBossBattle.spawn(room, bossId, millisecond())
        return room
    }

    protected async publish(room: GameDemoBossRoom): Promise<void> {
        room.addNotifyUids(...GameDemoBossBattle.watchers(room))
        const killedAt = room.respawnAt - GAME_DEMO_CONFIG.bossRespawnMs
        if (room.phase === 'settled' && millisecond() < killedAt + REWARD_REPOST_MS)
            await this.postRewards(room.rewards!.values())
    }

    protected async respond(
        lobby: GameDemoBossLobby,
        room: GameDemoBossRoom,
        bossId: GameDemoBossId,
        appliedDamage: number,
        res: IGameDemoBossState,
    ): Promise<void> {
        const member = GameDemoBossBattle.membership(lobby, this.uid)
        const mine = GameDemoBossBattle.myDamage(room, this.uid)
        res.uid = this.uid
        res.room = GameDemoBossBattle.view(room, bossId)
        res.currentBossId = member.bossId
        res.generation = member.generation
        res.serverNow = millisecond()
        res.nextAttackAt = mine.nextAttackAt
        res.heroAttack = await ActionGameDemoBoss.heroAttack(this.uid)
        res.myDamage = mine.damage
        res.appliedDamage = appliedDamage
    }
}
