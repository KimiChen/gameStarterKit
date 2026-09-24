/** gameDemo 的共享资源；每一种都是一份需要串行写入的整体。 */
export type GameDemoResource = 'season' | 'guild' | 'boss'

const RESOURCE_CODES: Readonly<Record<GameDemoResource, number>> = { season: 1, guild: 2, boss: 3 }

/** bindId 与玩家 uid 共用进程内串行表；放在远离 uid 的号段，避免与玩家串行组相撞。 */
const BIND_ID_BASE = 7_000_000_000_000

/**
 * 共享资源 Action 的调度声明（engine/docs/development.md「Action 进程与串行声明」）：
 * `taskGroupId` 只选择 Task Worker，`bindId` 只选择该进程内的串行组；同一资源的所有入口必须返回相同的两项。
 */
export class GameDemoTaskGroups {
    static taskGroupId(resource: GameDemoResource): number {
        return RESOURCE_CODES[resource]
    }

    static bindId(resource: GameDemoResource, sId: number = SERVER_ID): number {
        if (!Number.isSafeInteger(sId) || sId < 1) throw new Error(`invalid gameDemo server id: ${sId}`)
        return BIND_ID_BASE + sId * 1000 + RESOURCE_CODES[resource]
    }
}
