import { MessageHelper, log } from '@arthropoda/game-engine'

interface RoomLoop {
    stopped: boolean
    timer?: ReturnType<typeof setTimeout>
    work?: Promise<void>
}
/** Process-local lifecycle owner for independent room loops; no room may keep scheduling after drain. */
export class NativeLobbyRoomHost {
    private static readonly loops = new Map<string, RoomLoop>()
    static start(id: string, tick: () => Promise<void>, intervalMs = 1000): void {
        if (this.loops.has(id)) throw new Error(`duplicate native room loop: ${id}`)
        if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 60000)
            throw new Error('invalid room interval')
        const loop: RoomLoop = { stopped: false }
        this.loops.set(id, loop)
        const run = () => {
            if (loop.stopped) return
            loop.work = (async () => {
                try {
                    await MessageHelper.syncDoFunc(tick)
                } catch (error) {
                    log.error(`native room tick failed: ${id}`, error)
                } finally {
                    if (!loop.stopped) loop.timer = setTimeout(run, intervalMs)
                }
            })()
        }
        loop.timer = setTimeout(run, 0)
    }
    static async stop(): Promise<void> {
        const loops = [...this.loops.values()]
        for (const loop of loops) {
            loop.stopped = true
            if (loop.timer) clearTimeout(loop.timer)
        }
        await Promise.allSettled(loops.map((loop) => loop.work))
        this.loops.clear()
    }
}

/** Match the explicit taskGroupId used by room Actions; bindId only serializes local work. */
export function hostsObjectBinding(bindId: number): boolean {
    const info = globalThis as {
        WORKER_ID?: number | null
        WORKER_NUM?: number
        TASK_WORKER_NUM?: number
        USER_TASK_WORKER_NUM?: number
    }
    if (info.WORKER_ID === null) return false
    if (!(info.WORKER_NUM ?? 0) && !(info.TASK_WORKER_NUM ?? 0) && !(info.USER_TASK_WORKER_NUM ?? 0)) return true
    return (
        info.WORKER_ID ===
        ((info.TASK_WORKER_NUM ?? 0) > 0 ? (info.WORKER_NUM ?? 0) + (bindId % info.TASK_WORKER_NUM!) : 0)
    )
}
export function nativeObjectBinding(bindId: number): number | undefined {
    const info = globalThis as { WORKER_NUM?: number; TASK_WORKER_NUM?: number }
    // With Event Workers but no task pool, the native listener owns rooms and the room FIFO serializes them.
    return (info.WORKER_NUM ?? 0) > 0 && !(info.TASK_WORKER_NUM ?? 0) ? undefined : bindId
}

export function nativeObjectTaskGroup(bindId: number): number | undefined {
    return (globalThis.TASK_WORKER_NUM ?? 0) > 0 ? bindId : undefined
}
