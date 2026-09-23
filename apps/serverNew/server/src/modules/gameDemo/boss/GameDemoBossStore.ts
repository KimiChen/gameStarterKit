import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import {
    AtomicHashTransaction,
    atomicCounterCodec,
    atomicJsonCodec,
    type AtomicLeaseToken,
    type AtomicReadonly,
} from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG, gameDemoBossGoldReward } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import type {
    GameDemoBossBattle,
    GameDemoBossFighter,
    GameDemoBossEvent,
    GameDemoBossId,
    GameDemoBossRoom,
    GameDemoBossState,
    GameDemoBossList,
} from '../../../../generated/lobby-contract/kits/gameDemo/api/boss'
import {
    validateGameDemoBossId,
    validateGameDemoBossRoom,
    validateGameDemoBossRes,
    validateGameDemoBossListRes,
    type IGameDemoBossEnterReq,
    type IGameDemoBossLeaveReq,
    type IGameDemoBossAttackReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoBoss'
import { GameDemoAccount } from '../growth/GameDemoAccount'
import { GameDemoHero } from '../hero/GameDemoHero'
import { GameDemoMailbox } from '../rewards/GameDemoMailbox'

interface Damage {
    uid: string
    damage: number
    sequence: number
    nextAttackAt: number
    heroRevision: number
}
interface Visitor {
    uid: string
    generation: number
}
export interface BossMembership {
    bossId: GameDemoBossId | null
    generation: number
}
export interface StoredBoss {
    battle?: GameDemoBossBattle
    schemaVersion: 1
    configVersion: number
    bossId: GameDemoBossId
    name: string
    runId: string
    runNumber: number
    hp: number
    maxHp: number
    phase: 'running' | 'settling' | 'settled'
    revision: number
    ownerEpoch: number
    respawnAt: number
    goldReward: number
    cooldownMs: number
    respawnMs: number
    attackSequence: number
    damage: Damage[]
    visitors: Visitor[]
    rewardCursor: number
}
export type BossFence = (tx: AtomicHashTransaction, token: AtomicReadonly<AtomicLeaseToken>) => Promise<void>
const integer = (v: number) => Number.isSafeInteger(v) && v >= 0
function compare(a: Damage, b: Damage): number {
    return b.damage - a.damage || a.sequence - b.sequence || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
}
function publicRoom(room: StoredBoss): GameDemoBossRoom {
    return {
        ...(room.battle ? { battle: room.battle } : {}),
        bossId: room.bossId,
        name: room.name,
        runId: room.runId,
        runNumber: room.runNumber,
        hp: room.hp,
        maxHp: room.maxHp,
        phase: room.phase,
        revision: room.revision,
        ownerEpoch: room.ownerEpoch,
        respawnAt: room.respawnAt,
        damage: [...room.damage].sort(compare).map((d, index) => ({ uid: d.uid, damage: d.damage, rank: index + 1 })),
    }
}
const roomCodec = atomicJsonCodec<StoredBoss>((v): v is StoredBoss => {
    const r = v as StoredBoss | null
    if (
        !r ||
        r.schemaVersion !== 1 ||
        !Array.isArray(r.damage) ||
        !Array.isArray(r.visitors) ||
        r.visitors.length > GAME_DEMO_CONFIG.bossMaxParticipants
    )
        return false
    try {
        validateGameDemoBossRoom(publicRoom(r))
    } catch {
        return false
    }
    if (
        ![r.configVersion, r.goldReward, r.cooldownMs, r.respawnMs, r.attackSequence, r.rewardCursor].every(integer) ||
        !r.cooldownMs ||
        !r.respawnMs ||
        !r.goldReward ||
        r.rewardCursor > r.damage.length
    )
        return false
    if (r.phase === 'running' && r.rewardCursor !== 0) return false
    if (r.phase === 'settled' && r.rewardCursor !== r.damage.length) return false
    return (
        r.damage.every(
            (d) =>
                integer(d.sequence) &&
                d.sequence > 0 &&
                d.sequence <= r.attackSequence &&
                integer(d.nextAttackAt) &&
                integer(d.heroRevision),
        ) &&
        r.visitors.every(
            (p) =>
                typeof p.uid === 'string' &&
                !!p.uid &&
                p.uid.length <= 128 &&
                integer(p.generation) &&
                p.generation > 0,
        ) &&
        new Set(r.visitors.map((p) => p.uid)).size === r.visitors.length
    )
})
const memberCodec = atomicJsonCodec<BossMembership>((v): v is BossMembership => {
    const m = v as BossMembership | null
    if (!m || !integer(m.generation)) return false
    try {
        if (m.bossId !== null) validateGameDemoBossId(m.bossId)
    } catch {
        return false
    }
    return m.bossId === null || m.generation > 0
})
const stateGuard = (v: unknown): v is GameDemoBossState => {
    try {
        validateGameDemoBossRes(v)
        return true
    } catch {
        return false
    }
}
const listGuard = (v: unknown): v is GameDemoBossList => {
    try {
        validateGameDemoBossListRes(v)
        return true
    } catch {
        return false
    }
}

/** All room writes include the caller's lease fence in the same CAS as HP, damage and receipts. */
export class GameDemoBossStore {
    private readonly current = new AtomicHash('kt:gameDemo:boss-current:v1', atomicCounterCodec)
    readonly records = new AtomicHash('kt:gameDemo:boss-runs:v1', roomCodec)
    private readonly memberships = new AtomicHash('kt:gameDemo:boss-memberships:v1', memberCodec)
    private readonly enters = new AtomicOperation('kt:gameDemo:boss-enters:v1', stateGuard)
    private readonly attacks = new AtomicOperation('kt:gameDemo:boss-attacks:v1', stateGuard)
    private readonly leaves = new AtomicOperation('kt:gameDemo:boss-leaves:v1', listGuard)

    async membership(tx: AtomicHashTransaction, uid: string, sid: number): Promise<BossMembership> {
        return { ...((await tx.get(this.memberships, JSON.stringify([sid, uid]))) ?? { bossId: null, generation: 0 }) }
    }
    async load(tx: AtomicHashTransaction, sid: number, bossId: GameDemoBossId): Promise<StoredBoss | undefined> {
        const number = await tx.get(this.current, JSON.stringify([sid, bossId]))
        if (number === undefined) return undefined
        const stored = await tx.get(this.records, JSON.stringify([sid, bossId, number]))
        if (!stored) throw new Error('Boss current run is missing')
        return {
            ...stored,
            battle: stored.battle
                ? {
                      ...stored.battle,
                      players: stored.battle.players.map((p) => ({ ...p })),
                      events: stored.battle.events.map((e) => ({ ...e })),
                  }
                : {
                      players: stored.visitors.map((p) => ({
                          ...this.newFighter(p.uid, p.generation),
                          nextAttackAt: stored.damage.find((d) => d.uid === p.uid)?.nextAttackAt ?? 0,
                      })),
                      events: [],
                      sequence: 0,
                      nextCounterAt: 0,
                  },
            damage: stored.damage.map((d) => ({ ...d })),
            visitors: stored.visitors.map((p) => ({ ...p })),
        }
    }
    /** Caller must have asserted a live lease in tx before calling recover. */
    async recover(tx: AtomicHashTransaction, sid: number, bossId: GameDemoBossId, epoch: number): Promise<StoredBoss> {
        const room = await this.load(tx, sid, bossId)
        if (!room) return this.spawn(tx, sid, bossId, 1, epoch, [])
        if (room.ownerEpoch !== epoch) {
            room.ownerEpoch = epoch
            room.revision++
            await this.save(tx, sid, room)
        }
        return room
    }
    async list(uid: string, sid: number): Promise<GameDemoBossList> {
        return AtomicHashTransaction.run((tx) => this.listSnapshot(tx, uid, sid))
    }
    async read(uid: string, sid: number, bossId: GameDemoBossId): Promise<GameDemoBossState> {
        return AtomicHashTransaction.run(async (tx) =>
            this.snapshot(tx, uid, sid, await this.requireRoom(tx, sid, bossId)),
        )
    }
    async enter(
        uid: string,
        sid: number,
        req: IGameDemoBossEnterReq,
        token: AtomicReadonly<AtomicLeaseToken>,
        fence: BossFence,
    ): Promise<GameDemoBossState> {
        const result = await this.enters.run(JSON.stringify([sid, uid, req.clientReqId]), req.bossId, async (tx) => {
            await fence(tx, token)
            if (!(await new GameDemoAccount().snapshot(tx, uid, sid)).initialized)
                throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先初始化玩法账号' }
            const room = await this.recover(tx, sid, req.bossId, token.epoch)
            const prior = await this.membership(tx, uid, sid)
            const member =
                prior.bossId === req.bossId ? prior : { bossId: req.bossId, generation: prior.generation + 1 }
            if (
                !room.visitors.some((p) => p.uid === uid) &&
                room.visitors.length === GAME_DEMO_CONFIG.bossMaxParticipants
            ) {
                const active: Visitor[] = []
                for (const visitor of room.visitors) {
                    const m = await this.membership(tx, visitor.uid, sid)
                    if (m.bossId === room.bossId && m.generation === visitor.generation) active.push(visitor)
                }
                room.visitors = active
                if (active.length === GAME_DEMO_CONFIG.bossMaxParticipants)
                    throw { code: 'GAME_DEMO_BOSS_FULL', msg: '房间人数已满' }
            }
            const battle = room.battle!
            let fighter = battle.players.find((p) => p.uid === uid)
            if (!fighter) {
                if (
                    battle.players.length >= GAME_DEMO_CONFIG.bossMaxParticipants ||
                    (new Set([...battle.players, ...room.damage].map((p) => p.uid)).size >=
                        GAME_DEMO_CONFIG.bossMaxParticipants &&
                        !room.damage.some((p) => p.uid === uid))
                )
                    throw { code: 'GAME_DEMO_BOSS_FULL', msg: '本局参与人数已满' }
                fighter = this.newFighter(uid, member.generation)
                battle.players.push(fighter)
            }
            // Re-entering the same run cannot heal or bypass death / attack cooldown.
            if (fighter.generation !== member.generation) fighter.autoAttack = false
            fighter.generation = member.generation
            fighter.active = true
            room.visitors = [...room.visitors.filter((p) => p.uid !== uid), { uid, generation: member.generation }]
            room.revision++
            await this.save(tx, sid, room)
            await tx.set(this.memberships, JSON.stringify([sid, uid]), member)
            return this.snapshot(tx, uid, sid, room)
        })
        return validateGameDemoBossRes(result)
    }
    async leave(
        uid: string,
        sid: number,
        req: IGameDemoBossLeaveReq,
        token: AtomicReadonly<AtomicLeaseToken>,
        fence: BossFence,
    ): Promise<GameDemoBossList> {
        const result = await this.leaves.run(
            JSON.stringify([sid, uid, req.clientReqId]),
            JSON.stringify([req.bossId, req.generation]),
            async (tx) => {
                await fence(tx, token)
                const member = await this.membership(tx, uid, sid)
                this.checkMembership(member, req.bossId, req.generation)
                const room = await this.recover(tx, sid, req.bossId, token.epoch)
                const fighter = room.battle!.players.find((p) => p.uid === uid)
                if (fighter) {
                    fighter.active = false
                    fighter.autoAttack = false
                }
                room.visitors = room.visitors.filter((p) => p.uid !== uid)
                room.revision++
                await this.save(tx, sid, room)
                await tx.set(this.memberships, JSON.stringify([sid, uid]), {
                    bossId: null,
                    generation: member.generation + 1,
                })
                return this.listSnapshot(tx, uid, sid)
            },
        )
        return validateGameDemoBossListRes(result)
    }
    async attack(
        uid: string,
        sid: number,
        req: IGameDemoBossAttackReq,
        token: AtomicReadonly<AtomicLeaseToken>,
        fence: BossFence,
    ): Promise<GameDemoBossState> {
        const result = await this.attacks.run(
            JSON.stringify([sid, uid, req.clientReqId]),
            JSON.stringify(
                req.autoAttack === undefined
                    ? [req.bossId, req.runId, req.generation]
                    : [req.bossId, req.runId, req.generation, req.autoAttack],
            ),
            async (tx) => {
                await fence(tx, token)
                this.checkMembership(await this.membership(tx, uid, sid), req.bossId, req.generation)
                const room = await this.recover(tx, sid, req.bossId, token.epoch)
                if (room.runId !== req.runId) throw { code: 'GAME_DEMO_BOSS_STALE', msg: 'Boss 已换局，请刷新' }
                if (room.phase !== 'running') throw { code: 'GAME_DEMO_BOSS_ENDED', msg: 'Boss 已被击败' }
                const now = await tx.time(this.records)
                let fighter = room.battle!.players.find((p) => p.uid === uid)
                if (!fighter) {
                    if (
                        room.battle!.players.length >= GAME_DEMO_CONFIG.bossMaxParticipants ||
                        (new Set([...room.battle!.players, ...room.damage].map((p) => p.uid)).size >=
                            GAME_DEMO_CONFIG.bossMaxParticipants &&
                            !room.damage.some((p) => p.uid === uid))
                    )
                        throw { code: 'GAME_DEMO_BOSS_FULL', msg: '本局参与人数已满' }
                    fighter = this.newFighter(uid, req.generation)
                    room.battle!.players.push(fighter)
                }
                fighter.active = true
                fighter.generation = req.generation
                let damage = 0
                if (req.autoAttack !== undefined) {
                    // Explicit desired state makes retries safe; no toggle on the server.
                    fighter.autoAttack = req.autoAttack
                    room.revision++
                } else {
                    if (!fighter.hp) throw { code: 'GAME_DEMO_BOSS_DEAD', msg: '正在复活，请稍候' }
                    if (now < Math.max(fighter.nextAttackAt, room.damage.find((p) => p.uid === uid)?.nextAttackAt ?? 0))
                        throw { code: 'GAME_DEMO_BOSS_COOLDOWN', msg: '攻击冷却中' }
                    damage = await this.strike(tx, sid, room, fighter, now)
                }
                await this.save(tx, sid, room)
                return this.snapshot(tx, uid, sid, room, damage)
            },
        )
        return validateGameDemoBossRes(result)
    }
    async step(
        sid: number,
        bossId: GameDemoBossId,
        token: AtomicReadonly<AtomicLeaseToken>,
        fence: BossFence,
        allowRespawn = true,
    ): Promise<StoredBoss> {
        return AtomicHashTransaction.run(async (tx) => {
            await fence(tx, token)
            const room = await this.recover(tx, sid, bossId, token.epoch)
            const now = await tx.time(this.records)
            if (room.phase === 'running') {
                const battle = room.battle!
                const revision = room.revision
                const revived = new Set<string>()
                // Membership reads participate in CAS: switching rooms races safely with a tick.
                for (const fighter of battle.players) {
                    if (!fighter.active) continue
                    const member = await this.membership(tx, fighter.uid, sid)
                    if (member.bossId !== bossId || member.generation !== fighter.generation) {
                        fighter.active = false
                        fighter.autoAttack = false
                        room.revision++
                        continue
                    }
                    if (!fighter.hp && now >= fighter.reviveAt) {
                        fighter.hp = fighter.maxHp
                        fighter.reviveAt = 0
                        fighter.nextAttackAt = now + room.cooldownMs
                        revived.add(fighter.uid)
                        this.event(room, fighter, 'revive', fighter.hp, now)
                    }
                    if (
                        fighter.hp &&
                        fighter.autoAttack &&
                        now >= fighter.nextAttackAt &&
                        now >= (room.damage.find((p) => p.uid === fighter.uid)?.nextAttackAt ?? 0) &&
                        room.hp
                    ) {
                        await this.strike(tx, sid, room, fighter, now)
                    }
                }
                const alive = battle.players.filter((p) => p.active && p.autoAttack && p.hp > 0 && !revived.has(p.uid))
                if (room.hp && alive.length) {
                    if (!battle.nextCounterAt) {
                        battle.nextCounterAt = now + GAME_DEMO_CONFIG.bossCounterMs
                        room.revision++
                    } else if (now >= battle.nextCounterAt) {
                        // One counter per tick at most: recovery never replays a burst of offline damage.
                        for (const fighter of alive) {
                            const amount = Math.min(fighter.hp, GAME_DEMO_CONFIG.bossCounterDamage)
                            fighter.hp -= amount
                            if (!fighter.hp) fighter.reviveAt = now + GAME_DEMO_CONFIG.bossReviveMs
                            this.event(room, fighter, 'counter', amount, now)
                        }
                        battle.nextCounterAt = now + GAME_DEMO_CONFIG.bossCounterMs
                    }
                } else if (battle.nextCounterAt) {
                    battle.nextCounterAt = 0
                    room.revision++
                }
                if (room.revision !== revision) await this.save(tx, sid, room)
                return room
            }
            if (room.phase === 'settled') {
                return allowRespawn && now >= room.respawnAt
                    ? this.spawn(tx, sid, bossId, room.runNumber + 1, token.epoch, room.visitors)
                    : room
            }
            const ranked = [...room.damage].sort(compare)
            if (room.rewardCursor < ranked.length) {
                const index = room.rewardCursor
                const winner = ranked[index]
                await new GameDemoMailbox().deliver(
                    tx,
                    winner.uid,
                    sid,
                    `boss:${room.runId}:${winner.uid}`,
                    `${room.name}伤害榜第 ${index + 1} 名奖励`,
                    gameDemoBossGoldReward(room.goldReward, index + 1),
                    now,
                )
                room.rewardCursor++
            }
            if (room.rewardCursor === ranked.length) room.phase = 'settled'
            room.revision++
            await this.save(tx, sid, room)
            return room
        })
    }
    private newFighter(uid: string, generation: number): GameDemoBossFighter {
        return {
            uid,
            generation,
            active: true,
            hp: GAME_DEMO_CONFIG.bossPlayerHp,
            maxHp: GAME_DEMO_CONFIG.bossPlayerHp,
            autoAttack: false,
            nextAttackAt: 0,
            reviveAt: 0,
        }
    }
    private event(
        room: StoredBoss,
        player: GameDemoBossFighter,
        kind: GameDemoBossEvent['kind'],
        amount: number,
        now: number,
    ): void {
        const battle = room.battle!
        battle.events.push({ sequence: ++battle.sequence, at: now, uid: player.uid, kind, amount })
        battle.events = battle.events.slice(-GAME_DEMO_CONFIG.bossEventLimit)
        room.revision++
    }
    private async strike(
        tx: AtomicHashTransaction,
        sid: number,
        room: StoredBoss,
        fighter: GameDemoBossFighter,
        now: number,
    ): Promise<number> {
        let player = room.damage.find((p) => p.uid === fighter.uid)
        if (!player && room.damage.length >= GAME_DEMO_CONFIG.bossMaxParticipants) {
            fighter.autoAttack = false
            room.revision++
            return 0
        }
        const hero = await new GameDemoHero().snapshot(tx, fighter.uid, sid)
        const amount = Math.min(room.hp, hero.attack)
        if (!player) {
            player = { uid: fighter.uid, damage: 0, sequence: 0, nextAttackAt: 0, heroRevision: 0 }
            room.damage.push(player)
        }
        player.damage += amount
        player.sequence = ++room.attackSequence
        player.nextAttackAt = fighter.nextAttackAt = now + room.cooldownMs
        player.heroRevision = hero.revision
        room.hp -= amount
        this.event(room, fighter, 'sword', amount, now)
        if (!room.hp) {
            room.phase = 'settling'
            room.respawnAt = now + room.respawnMs
        }
        return amount
    }
    private checkMembership(member: BossMembership, bossId: GameDemoBossId, generation: number): void {
        if (member.bossId !== bossId || member.generation !== generation)
            throw { code: 'GAME_DEMO_BOSS_STALE', msg: '房间已切换，请刷新' }
    }
    private async spawn(
        tx: AtomicHashTransaction,
        sid: number,
        bossId: GameDemoBossId,
        number: number,
        epoch: number,
        visitors: Visitor[],
    ): Promise<StoredBoss> {
        const config = GAME_DEMO_CONFIG.bosses.find((b) => b.id === bossId)!
        const room: StoredBoss = {
            battle: {
                players: visitors.map((p) => this.newFighter(p.uid, p.generation)),
                events: [],
                sequence: 0,
                nextCounterAt: 0,
            },
            schemaVersion: 1,
            configVersion: GAME_DEMO_CONFIG.version,
            bossId,
            name: config.name,
            runId: `${sid}:${bossId}:${number}`,
            runNumber: number,
            hp: config.maxHp,
            maxHp: config.maxHp,
            phase: 'running',
            revision: 1,
            ownerEpoch: epoch,
            respawnAt: 0,
            goldReward: config.goldReward,
            cooldownMs: GAME_DEMO_CONFIG.bossCooldownMs,
            respawnMs: GAME_DEMO_CONFIG.bossRespawnMs,
            attackSequence: 0,
            damage: [],
            visitors: visitors.map((p) => ({ ...p })),
            rewardCursor: 0,
        }
        await tx.set(this.current, JSON.stringify([sid, bossId]), number)
        await this.save(tx, sid, room)
        return room
    }
    private async save(tx: AtomicHashTransaction, sid: number, room: StoredBoss): Promise<void> {
        await tx.set(this.records, JSON.stringify([sid, room.bossId, room.runNumber]), room)
    }
    private async requireRoom(tx: AtomicHashTransaction, sid: number, bossId: GameDemoBossId): Promise<StoredBoss> {
        const room = await this.load(tx, sid, bossId)
        if (!room) throw { code: 'GAME_DEMO_BOSS_RECOVERING', msg: '房间正在恢复，请稍后刷新' }
        return room
    }
    private async listSnapshot(tx: AtomicHashTransaction, uid: string, sid: number): Promise<GameDemoBossList> {
        const rooms: GameDemoBossRoom[] = []
        for (const boss of GAME_DEMO_CONFIG.bosses) rooms.push(publicRoom(await this.requireRoom(tx, sid, boss.id)))
        const member = await this.membership(tx, uid, sid)
        return { rooms, currentBossId: member.bossId, generation: member.generation }
    }
    private async snapshot(
        tx: AtomicHashTransaction,
        uid: string,
        sid: number,
        room: StoredBoss,
        appliedDamage = 0,
    ): Promise<GameDemoBossState> {
        const member = await this.membership(tx, uid, sid)
        const hero = await new GameDemoHero().snapshot(tx, uid, sid)
        const mine = room.damage.find((d) => d.uid === uid)
        return {
            uid,
            room: publicRoom(room),
            currentBossId: member.bossId,
            generation: member.generation,
            serverNow: await tx.time(this.records),
            nextAttackAt: mine?.nextAttackAt ?? 0,
            heroAttack: hero.attack,
            heroRevision: hero.revision,
            myDamage: mine?.damage ?? 0,
            appliedDamage,
        }
    }
}
