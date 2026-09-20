import { GameModuleCatalog } from './GameModuleCatalog'
import type { GameModuleApp, GameModuleStartupPhase, RegisteredContribution, StartupContribution } from './GameModule'

export class GameModuleLifecycle {
    static async run(app: Exclude<GameModuleApp, 'all'>, phase: GameModuleStartupPhase) {
        for (const entry of this.entries(app, phase)) await entry.contribution.run()
    }

    static entries(app: Exclude<GameModuleApp, 'all'>, phase: GameModuleStartupPhase) {
        const startupOwner = isServerStartupOwner()
        return GameModuleCatalog.systems.startup.entries.filter(
            (entry) =>
                (entry.contribution.app === app || entry.contribution.app === 'all') &&
                entry.contribution.phase === phase &&
                (entry.contribution.scope !== 'server' || startupOwner),
        ) as readonly RegisteredContribution<StartupContribution>[]
    }
}

/**
 * 多进程下 service 的启动流程在每个 worker 各执行一遍，scope: 'server' 的贡献只在启动落点进程执行。
 * 落点取 global.WORKER_ID === 0（T7 进程常量）；未设置视为单进程；null 表示 master（不跑业务）。
 */
export function isServerStartupOwner(): boolean {
    const processInfo = globalThis as {
        WORKER_ID?: number | null
        WORKER_NUM?: number
        TASK_WORKER_NUM?: number
        PROCESS_ROLE?: string
    }
    const workerId = processInfo.WORKER_ID
    if (workerId === undefined) return true
    if (workerId === null) return false
    if ((processInfo.TASK_WORKER_NUM ?? 0) > 0) {
        return processInfo.PROCESS_ROLE === 'TASK_WORKER' && workerId === processInfo.WORKER_NUM
    }
    return workerId === 0
}
