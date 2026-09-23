import {
    executeObjectAction,
    lobbyRouteOutcome,
    recordObjectActionSync,
    type LobbyConnectionContext,
} from '@arthropoda/game-engine'
import {
    GameDemoBossRpc,
    type IGameDemoBossGetReq,
    type IGameDemoBossEnterReq,
    type IGameDemoBossLeaveReq,
    type IGameDemoBossAttackReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoBoss'
import type {
    GameDemoBossList,
    GameDemoBossState,
    GameDemoBossId,
} from '../../../../generated/lobby-contract/kits/gameDemo/api/boss'
import type {
    NativeLobbyRouteRegistry,
    NativeLobbyRouteServices,
} from '../../../runtime/lobby/NativeLobbyRouteRegistry'
import { nativeObjectBinding, nativeObjectTaskGroup } from '../../../runtime/lobby/NativeLobbyRoomHost'
import { GameDemoBossRooms, gameDemoBossBinding } from './GameDemoBossRooms'
export class GameDemoBossRoutes {
    constructor(
        private readonly services: NativeLobbyRouteServices,
        private readonly rooms: GameDemoBossRooms,
    ) {}
    register(registry: NativeLobbyRouteRegistry): void {
        registry.register(GameDemoBossRpc.List, (c) =>
            this.run(c, GameDemoBossRpc.List, {}, undefined, () => this.rooms.list(c.uid, c.sId), false),
        )
        registry.register(GameDemoBossRpc.Get, (c, p) => {
            const req = p as IGameDemoBossGetReq
            return this.run(
                c,
                GameDemoBossRpc.Get,
                req,
                req.bossId,
                () => this.rooms.read(c.uid, c.sId, req.bossId),
                false,
            )
        })
        registry.register(GameDemoBossRpc.Enter, (c, p) => {
            const req = p as IGameDemoBossEnterReq
            return this.run(c, GameDemoBossRpc.Enter, req, req.bossId, () => this.rooms.enter(c.uid, c.sId, req), true)
        })
        registry.register(GameDemoBossRpc.Leave, (c, p) => {
            const req = p as IGameDemoBossLeaveReq
            return this.run(c, GameDemoBossRpc.Leave, req, req.bossId, () => this.rooms.leave(c.uid, c.sId, req), true)
        })
        registry.register(GameDemoBossRpc.Attack, (c, p) => {
            const req = p as IGameDemoBossAttackReq
            return this.run(
                c,
                GameDemoBossRpc.Attack,
                req,
                req.bossId,
                () => this.rooms.attack(c.uid, c.sId, req),
                true,
            )
        })
    }
    private async run<T extends GameDemoBossList | GameDemoBossState>(
        c: LobbyConnectionContext,
        route: string,
        req: unknown,
        bossId: GameDemoBossId | undefined,
        action: () => Promise<T>,
        write: boolean,
    ) {
        const uid = await this.services.identities.resolve(c.uid, c.sId)
        const result = await executeObjectAction(
            route,
            req,
            {} as T,
            {
                getTaskGroupId: async () => nativeObjectTaskGroup(bossId ? gameDemoBossBinding(c.sId, bossId) : uid),
                getBindId: async () => nativeObjectBinding(bossId ? gameDemoBossBinding(c.sId, bossId) : uid),
                doAction: async (_req, res) => {
                    const committed = await action()
                    Object.assign(res, committed)
                    if (!write) return
                    recordObjectActionSync({
                        gameDemoBossSelection: { bossId: committed.currentBossId, generation: committed.generation },
                        versions: { gameDemoBossSelection: committed.generation },
                    })
                    if ('room' in committed) {
                        const key = `gameDemoBossRoom_${committed.room.bossId}_${committed.room.runNumber}`
                        recordObjectActionSync({ [key]: committed.room, versions: { [key]: committed.room.revision } })
                    }
                },
            },
            { uid, externalUid: c.uid, sId: c.sId },
        )
        if (!result.ok) throw result.error
        return lobbyRouteOutcome(result.data, result.sync)
    }
}
