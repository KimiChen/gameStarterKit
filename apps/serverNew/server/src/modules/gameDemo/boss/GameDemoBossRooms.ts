import { gameDemoLifecycle } from '../GameDemoPersistence'
import { GameDemoLease as AtomicLease } from '../GameDemoPersistence'
import { randomUUID } from 'node:crypto'
import { AtomicLeaseLost, AtomicHashTransaction, OwnedRoom, OwnedRoomUnavailable } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import {
    GameDemoBossPush,
    type IGameDemoBossEnterReq,
    type IGameDemoBossLeaveReq,
    type IGameDemoBossAttackReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoBoss'
import type { GameDemoBossId } from '../../../../generated/lobby-contract/kits/gameDemo/api/boss'
import { NativeLobbyRoomHost, hostsObjectBinding } from '../../../runtime/lobby/NativeLobbyRoomHost'
import { GameDemoBossStore, type StoredBoss } from './GameDemoBossStore'
import type { NativeLobbyRouteServices } from '../../../runtime/lobby/NativeLobbyRouteRegistry'

/** Stable room binding, separate from player routing. The existing task-worker modulo remains unchanged. */
export function gameDemoBossBinding(sid: number, bossId: GameDemoBossId): number {
    return 4000000000000 + sid * 10 + GAME_DEMO_CONFIG.bosses.findIndex((b) => b.id === bossId)
}
interface RoomInstance {
    room: OwnedRoom<StoredBoss>
    store: GameDemoBossStore
    restoredEpoch: number
}
export class GameDemoBossRooms {
    private readonly rooms = new Map<string, RoomInstance>()
    private readonly owner = randomUUID()
    constructor(
        private readonly push: NativeLobbyRouteServices['pushToUser'],
        private readonly owns = hostsObjectBinding,
    ) {}
    start(sid: number): void {
        for (const config of GAME_DEMO_CONFIG.bosses) {
            if (!this.owns(gameDemoBossBinding(sid, config.id))) continue
            this.instance(sid, config.id)
            NativeLobbyRoomHost.start(`gameDemo:${sid}:${config.id}`, () => this.tick(sid, config.id))
        }
    }
    async list(uid: string, sid: number) {
        return new GameDemoBossStore().list(uid, sid)
    }
    async read(uid: string, sid: number, bossId: GameDemoBossId) {
        return this.perform(sid, bossId, async ({ room, store }) => {
            const result = await store.read(uid, sid, bossId)
            if (result.currentBossId === bossId) room.subscribe(uid, result.generation)
            return result
        })
    }
    async enter(uid: string, sid: number, req: IGameDemoBossEnterReq) {
        return this.perform(sid, req.bossId, async ({ room, store }, token) => {
            const result = await store.enter(uid, sid, req, token, (tx, t) => room.assert(tx, t))
            // A replay may describe an old selection; only current membership is subscribed.
            const current = await store.read(uid, sid, req.bossId)
            if (current.currentBossId === req.bossId) room.subscribe(uid, current.generation)
            return result
        })
    }
    async leave(uid: string, sid: number, req: IGameDemoBossLeaveReq) {
        return this.perform(sid, req.bossId, async ({ room, store }, token) => {
            const result = await store.leave(uid, sid, req, token, (tx, t) => room.assert(tx, t))
            room.unsubscribe(uid, req.generation)
            return result
        })
    }
    async attack(uid: string, sid: number, req: IGameDemoBossAttackReq) {
        return this.perform(sid, req.bossId, async ({ room, store }, token) =>
            store.attack(uid, sid, req, token, (tx, t) => room.assert(tx, t)),
        )
    }
    async tick(sid: number, bossId: GameDemoBossId): Promise<void> {
        if (!(await gameDemoLifecycle.runnable())) return
        try {
            const batch = await this.perform(sid, bossId, async ({ room, store }, token) => {
                let state = room.state!
                for (let i = 0; i < 4; i++) {
                    state = await store.step(sid, bossId, token, (tx, t) => room.assert(tx, t))
                    if (state.phase !== 'settling') break
                }
                room.remember(state)
                const targets = []
                for (const watcher of room.watchers()) {
                    const current = await AtomicHashTransaction.run((tx) => store.membership(tx, watcher.uid, sid))
                    if (current.bossId !== bossId || current.generation !== watcher.generation) {
                        room.unsubscribe(watcher.uid, watcher.generation)
                        continue
                    }
                    targets.push(watcher)
                }
                return { room, state, targets }
            })
            // Network delivery never occupies the room's mutation FIFO. Every frame names the room generation.
            await Promise.allSettled(
                batch.targets.map(async (target) => {
                    const delivered = await this.push(target.uid, sid, GameDemoBossPush.Changed, {
                        bossId,
                        runId: batch.state.runId,
                        runNumber: batch.state.runNumber,
                        revision: batch.state.revision,
                        ownerEpoch: batch.state.ownerEpoch,
                        generation: target.generation,
                    })
                    if (!delivered) batch.room.unsubscribe(target.uid, target.generation)
                }),
            )
        } catch (error) {
            if ((error as { code?: string }).code !== 'GAME_DEMO_BOSS_RECOVERING') throw error
        }
    }
    private instance(sid: number, bossId: GameDemoBossId): RoomInstance {
        if (!this.owns(gameDemoBossBinding(sid, bossId)))
            throw { code: 'GAME_DEMO_BOSS_RECOVERING', msg: '请求尚未到达房间所属进程' }
        const id = `${sid}:${bossId}`
        let instance = this.rooms.get(id)
        if (!instance) {
            const store = new GameDemoBossStore()
            const lease = new AtomicLease('kt:gameDemo:boss-leases:v1', JSON.stringify([sid, bossId]))
            instance = {
                store,
                restoredEpoch: 0,
                room: new OwnedRoom(id, lease, this.owner, (tx, token) => store.recover(tx, sid, bossId, token.epoch)),
            }
            this.rooms.set(id, instance)
        }
        return instance
    }
    private async perform<T>(
        sid: number,
        bossId: GameDemoBossId,
        work: (instance: RoomInstance, token: Parameters<OwnedRoom<StoredBoss>['assert']>[1]) => Promise<T>,
    ): Promise<T> {
        try {
            const instance = this.instance(sid, bossId)
            return await instance.room.run(async (token) => {
                if (instance.restoredEpoch !== token.epoch) {
                    instance.restoredEpoch = token.epoch
                    for (const visitor of instance.room.state!.visitors)
                        instance.room.subscribe(visitor.uid, visitor.generation)
                    console.log(
                        JSON.stringify({
                            event: 'gameDemo-room-recovered',
                            roomId: instance.room.id,
                            runId: instance.room.state!.runId,
                            epoch: token.epoch,
                            workerId: globalThis.WORKER_ID ?? null,
                            pid: process.pid,
                        }),
                    )
                }
                return work(instance, token)
            })
        } catch (error) {
            if (error instanceof OwnedRoomUnavailable || error instanceof AtomicLeaseLost)
                throw { code: 'GAME_DEMO_BOSS_RECOVERING', msg: '房间正在恢复，请稍后重试原操作' }
            throw error
        }
    }
}
let runtime: GameDemoBossRooms | undefined
export function installGameDemoBossRooms(push: NativeLobbyRouteServices['pushToUser']): GameDemoBossRooms {
    runtime = new GameDemoBossRooms(push)
    return runtime
}
export function gameDemoBossRooms(): GameDemoBossRooms {
    if (!runtime) throw new Error('Boss room routes must be installed before startup')
    return runtime
}
