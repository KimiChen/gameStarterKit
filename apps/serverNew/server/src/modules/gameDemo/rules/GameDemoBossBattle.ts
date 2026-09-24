import type { ReadonlyBean } from '@arthropoda/game-engine'
import {
    GAME_DEMO_CONFIG,
    gameDemoBossConfig,
    gameDemoBossGoldReward,
    type GameDemoBossId,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type {
    IGameDemoBossEvent,
    IGameDemoBossFighter,
    IGameDemoBossList,
    IGameDemoBossRoom,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { GameDemoBossFighterBean } from '../bean/GameDemoBossFighterBean'
import type { GameDemoBossLobby } from '../bean/GameDemoBossLobby'
import type { GameDemoBossRoom } from '../bean/GameDemoBossRoom'

type RoomView = GameDemoBossRoom | ReadonlyBean<GameDemoBossRoom>
type LobbyView = GameDemoBossLobby | ReadonlyBean<GameDemoBossLobby>
type EventKind = IGameDemoBossEvent['kind']

export interface GameDemoBossMembership {
    readonly bossId: GameDemoBossId | null
    readonly generation: number
}

/**
 * 多 Boss 房间：三个房间共用英雄攻击力，每秒可攻击一次；同账号同时只在一个房间，离开保留本局伤害。
 * 击杀后按伤害名次给所有参与者登记邮件奖励，死亡 60 秒后换下一局。
 *
 * 大厅与房间是同一个串行组里的整体资源；`step` 由每秒的 tick Action 调用，一次最多结算一个到期动作，
 * 不追补离线期间的密集攻击。
 */
export class GameDemoBossBattle {
    static bossIds(): GameDemoBossId[] {
        return GAME_DEMO_CONFIG.bosses.map((boss) => boss.id)
    }

    /** 房间 Bean 的 id：配置序号 + 1。 */
    static roomId(bossId: GameDemoBossId): number {
        const index = GAME_DEMO_CONFIG.bosses.findIndex((boss) => boss.id === bossId)
        if (index < 0) throw { code: 'INVALID_PAYLOAD', msg: 'Boss 不存在' }
        return index + 1
    }

    static membership(lobby: LobbyView | undefined, uid: number): GameDemoBossMembership {
        const member = lobby?.members?.get(uid)
        return {
            bossId: member?.bossId ? (member.bossId as GameDemoBossId) : null,
            generation: member?.generation ?? 0,
        }
    }

    /** 开新局：保留仍在房间里的参与者，满血、清空伤害与事件。 */
    static spawn(room: GameDemoBossRoom, bossId: GameDemoBossId, now: number): void {
        const config = gameDemoBossConfig(bossId)
        const carried = room.fighters!.values().filter((fighter) => fighter.active)
        room.fighters!.clear()
        for (const fighter of carried) room.fighters!.set(fighter.uid, this.newFighter(fighter.uid, fighter.generation))
        room.events!.clear()
        room.rewards!.clear()
        room.runNumber++
        room.hp = config.maxHp
        room.phase = 'running'
        room.startedAt = now
        room.respawnAt = 0
        room.nextCounterAt = 0
        room.attackSeq = 0
        room.eventSeq = 0
        room.revision++
    }

    static enter(lobby: GameDemoBossLobby, room: GameDemoBossRoom, bossId: GameDemoBossId, uid: number): void {
        const prior = this.membership(lobby, uid)
        const generation = prior.bossId === bossId ? prior.generation : prior.generation + 1
        let fighter = room.fighters!.get(uid)
        if (!fighter) {
            this.assertCapacity(room)
            room.fighters!.set(uid, this.newFighter(uid, generation))
            fighter = room.fighters!.get(uid)!
        }
        // 重进同一局不能回血，也不能绕过死亡与攻击冷却；换过房间的旧自动攻击意愿作废。
        if (fighter.generation !== generation) fighter.autoAttack = false
        fighter.generation = generation
        fighter.active = true
        lobby.members!.set(uid, { uid, bossId, generation })
        room.revision++
    }

    static leave(
        lobby: GameDemoBossLobby,
        room: GameDemoBossRoom,
        bossId: GameDemoBossId,
        uid: number,
        generation: number,
    ): void {
        this.assertMembership(lobby, bossId, uid, generation)
        const fighter = room.fighters!.get(uid)
        if (fighter) {
            fighter.active = false
            fighter.autoAttack = false
        }
        lobby.members!.set(uid, { uid, bossId: '', generation: generation + 1 })
        room.revision++
    }

    /** `autoAttack` 有值时只设置自动攻击意愿（显式期望值，重试安全）；否则立即出剑并返回伤害。 */
    static attack(
        lobby: GameDemoBossLobby,
        room: GameDemoBossRoom,
        bossId: GameDemoBossId,
        uid: number,
        request: { runNumber: number; generation: number; autoAttack?: boolean },
        heroAttack: number,
        now: number,
    ): number {
        this.assertMembership(lobby, bossId, uid, request.generation)
        if (room.runNumber !== request.runNumber) throw { code: 'GAME_DEMO_BOSS_STALE', msg: 'Boss 已换局，请刷新' }
        if (room.phase !== 'running') throw { code: 'GAME_DEMO_BOSS_ENDED', msg: 'Boss 已被击败' }
        let fighter = room.fighters!.get(uid)
        if (!fighter) {
            this.assertCapacity(room)
            room.fighters!.set(uid, this.newFighter(uid, request.generation))
            fighter = room.fighters!.get(uid)!
        }
        fighter.active = true
        fighter.generation = request.generation
        room.revision++
        if (request.autoAttack !== undefined) {
            fighter.autoAttack = request.autoAttack
            return 0
        }
        if (!fighter.hp) throw { code: 'GAME_DEMO_BOSS_DEAD', msg: '正在复活，请稍候' }
        if (now < fighter.nextAttackAt) throw { code: 'GAME_DEMO_BOSS_COOLDOWN', msg: '攻击冷却中' }
        return this.strike(room, bossId, fighter, heroAttack, now)
    }

    /** 每秒推进：复活、自动攻击、Boss 反击与换局。返回是否有变化。 */
    static async step(
        lobby: LobbyView,
        room: GameDemoBossRoom,
        bossId: GameDemoBossId,
        now: number,
        heroAttack: (uid: number) => Promise<number>,
    ): Promise<boolean> {
        const revision = room.revision
        if (room.phase === 'settled') {
            if (now >= room.respawnAt) this.spawn(room, bossId, now)
            return room.revision !== revision
        }
        const revived = new Set<number>()
        for (const fighter of room.fighters!.values()) {
            if (!fighter.active) continue
            const member = this.membership(lobby, fighter.uid)
            if (member.bossId !== bossId || member.generation !== fighter.generation) {
                fighter.active = false
                fighter.autoAttack = false
                room.revision++
                continue
            }
            if (!fighter.hp && now >= fighter.reviveAt) {
                fighter.hp = fighter.maxHp
                fighter.reviveAt = 0
                fighter.nextAttackAt = now + GAME_DEMO_CONFIG.bossCooldownMs
                revived.add(fighter.uid)
                this.event(room, fighter.uid, 'revive', fighter.hp, now)
            }
            if (fighter.hp && fighter.autoAttack && now >= fighter.nextAttackAt && room.phase === 'running')
                this.strike(room, bossId, fighter, await heroAttack(fighter.uid), now)
        }
        if (room.phase !== 'running') return true
        const alive = room
            .fighters!.values()
            .filter((fighter) => fighter.active && fighter.autoAttack && fighter.hp > 0 && !revived.has(fighter.uid))
        if (alive.length) {
            if (!room.nextCounterAt) {
                room.nextCounterAt = now + GAME_DEMO_CONFIG.bossCounterMs
                room.revision++
            } else if (now >= room.nextCounterAt) {
                for (const fighter of alive) {
                    const amount = Math.min(fighter.hp, GAME_DEMO_CONFIG.bossCounterDamage)
                    fighter.hp -= amount
                    if (!fighter.hp) fighter.reviveAt = now + GAME_DEMO_CONFIG.bossReviveMs
                    this.event(room, fighter.uid, 'counter', amount, now)
                }
                room.nextCounterAt = now + GAME_DEMO_CONFIG.bossCounterMs
            }
        } else if (room.nextCounterAt) {
            room.nextCounterAt = 0
            room.revision++
        }
        return room.revision !== revision
    }

    /** 当前在房间里的参与者：框架据此推送 sync 帧。 */
    static watchers(room: RoomView): number[] {
        return (room.fighters?.values() ?? []).filter((fighter) => fighter.active).map((fighter) => fighter.uid)
    }

    static view(room: RoomView | undefined, bossId: GameDemoBossId): IGameDemoBossRoom {
        const config = gameDemoBossConfig(bossId)
        if (!room) {
            return {
                bossId,
                name: config.name,
                runNumber: 1,
                hp: config.maxHp,
                maxHp: config.maxHp,
                phase: 'running',
                revision: 0,
                respawnAt: 0,
                nextCounterAt: 0,
                damage: [],
                fighters: [],
                events: [],
            }
        }
        const fighters = room.fighters?.values() ?? []
        const events: IGameDemoBossEvent[] = []
        room.events?.forEach((event) =>
            events.push({
                sequence: event.sequence,
                at: event.at,
                uid: event.uid,
                kind: event.kind as EventKind,
                amount: event.amount,
            }),
        )
        return {
            bossId,
            name: config.name,
            runNumber: room.runNumber,
            hp: room.hp,
            maxHp: config.maxHp,
            phase: room.phase as IGameDemoBossRoom['phase'],
            revision: room.revision,
            respawnAt: room.respawnAt,
            nextCounterAt: room.nextCounterAt,
            damage: this.ranked(fighters).map((fighter, index) => ({
                uid: fighter.uid,
                damage: fighter.damage,
                rank: index + 1,
            })),
            fighters: fighters.map((fighter): IGameDemoBossFighter => ({
                uid: fighter.uid,
                active: fighter.active,
                hp: fighter.hp,
                maxHp: fighter.maxHp,
                autoAttack: fighter.autoAttack,
                nextAttackAt: fighter.nextAttackAt,
                reviveAt: fighter.reviveAt,
            })),
            events: events.sort((a, b) => a.sequence - b.sequence),
        }
    }

    static list(
        lobby: LobbyView | undefined,
        rooms: ReadonlyMap<GameDemoBossId, RoomView | undefined>,
        uid: number,
    ): IGameDemoBossList {
        const member = this.membership(lobby, uid)
        return {
            rooms: this.bossIds().map((bossId) => this.view(rooms.get(bossId), bossId)),
            currentBossId: member.bossId,
            generation: member.generation,
        }
    }

    static myDamage(room: RoomView | undefined, uid: number): { damage: number; nextAttackAt: number } {
        const fighter = room?.fighters?.get(uid)
        return { damage: fighter?.damage ?? 0, nextAttackAt: fighter?.nextAttackAt ?? 0 }
    }

    private static strike(
        room: GameDemoBossRoom,
        bossId: GameDemoBossId,
        fighter: GameDemoBossFighterBean,
        heroAttack: number,
        now: number,
    ): number {
        const amount = Math.min(room.hp, heroAttack)
        fighter.damage += amount
        fighter.damageSeq = ++room.attackSeq
        fighter.nextAttackAt = now + GAME_DEMO_CONFIG.bossCooldownMs
        room.hp -= amount
        this.event(room, fighter.uid, 'sword', amount, now)
        if (!room.hp) this.settle(room, bossId, now)
        return amount
    }

    /** 击杀即定榜：奖励写进房间，由 Action 在提交后经可靠队列投递。 */
    private static settle(room: GameDemoBossRoom, bossId: GameDemoBossId, now: number): void {
        const config = gameDemoBossConfig(bossId)
        this.ranked(room.fighters!.values()).forEach((fighter, index) => {
            const rank = index + 1
            room.rewards!.set(rank, {
                uid: fighter.uid,
                gold: gameDemoBossGoldReward(config.goldReward, rank),
                title: `${config.name}伤害榜第 ${rank} 名奖励`,
                source: `boss:${bossId}:${room.startedAt}:${fighter.uid}`,
            })
        })
        room.phase = 'settled'
        room.respawnAt = now + GAME_DEMO_CONFIG.bossRespawnMs
        room.nextCounterAt = 0
        room.revision++
    }

    private static ranked<T extends { readonly damage: number; readonly damageSeq: number; readonly uid: number }>(
        fighters: readonly T[],
    ): T[] {
        return fighters
            .filter((fighter) => fighter.damage > 0)
            .sort((a, b) => b.damage - a.damage || a.damageSeq - b.damageSeq || a.uid - b.uid)
    }

    private static event(room: GameDemoBossRoom, uid: number, kind: EventKind, amount: number, now: number): void {
        const sequence = ++room.eventSeq
        room.events!.set(sequence, { sequence, at: now, uid, kind, amount })
        room.events!.delete(sequence - GAME_DEMO_CONFIG.bossEventLimit)
        room.revision++
    }

    private static newFighter(uid: number, generation: number) {
        return {
            uid,
            generation,
            active: true,
            hp: GAME_DEMO_CONFIG.bossPlayerHp,
            maxHp: GAME_DEMO_CONFIG.bossPlayerHp,
            autoAttack: false,
            nextAttackAt: 0,
            reviveAt: 0,
            damage: 0,
            damageSeq: 0,
        }
    }

    private static assertCapacity(room: GameDemoBossRoom): void {
        if (room.fighters!.size() >= GAME_DEMO_CONFIG.bossMaxParticipants)
            throw { code: 'GAME_DEMO_BOSS_FULL', msg: '本局参与人数已满' }
    }

    private static assertMembership(
        lobby: GameDemoBossLobby,
        bossId: GameDemoBossId,
        uid: number,
        generation: number,
    ): void {
        const member = this.membership(lobby, uid)
        if (member.bossId !== bossId || member.generation !== generation)
            throw { code: 'GAME_DEMO_BOSS_STALE', msg: '房间已切换，请刷新' }
    }
}
