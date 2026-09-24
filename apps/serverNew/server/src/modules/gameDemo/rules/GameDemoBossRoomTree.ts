import { RoomTree, type RoomSession, type RoomTreeOptions } from '@arthropoda/game-engine'
import type { GameDemoBossId } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import { GameDemoBossLobby } from '../bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../bean/GameDemoBossRoom'
import { GameDemoBossBattle } from './GameDemoBossBattle'

/** RoomTree example over the current Boss Beans; Boss Actions and GameDemoTicks remain authoritative. */
export class GameDemoBossRoomTree {
    readonly tree: RoomTree
    readonly beanId: number

    constructor(
        sid: number,
        readonly bossId: GameDemoBossId,
        options: RoomTreeOptions = {},
    ) {
        this.beanId = GameDemoBossBattle.roomId(bossId)
        this.tree = new RoomTree(
            `gameDemo:${sid}:${bossId}`,
            {
                isMember: async (uid) => {
                    const lobby = await GameDemoBossLobby.loadOnlyRead(1)
                    return GameDemoBossBattle.membership(lobby, uid).bossId === bossId
                },
                snapshot: async () => {
                    const room = await GameDemoBossRoom.loadOnlyRead(this.beanId)
                    return GameDemoBossBattle.view(room, bossId)
                },
            },
            options,
        )
    }

    resume(session: RoomSession, sendFull: (snapshot: unknown) => Promise<void>): Promise<void> {
        return this.tree.root.resume(session, (_path, snapshot) => sendFull(snapshot))
    }

    detach(session: RoomSession): void {
        this.tree.root.detach(session)
    }

    bind(bean: GameDemoBossRoom): void {
        this.tree.root.bind(bean, this.beanId)
    }

    close(): Promise<void> {
        return this.tree.close()
    }
}
