export type RuntimeWorkerRole = 'WORKER' | 'TASK_WORKER' | 'USER_TASK_WORKER'

export interface RuntimeWorkerInfo {
    workerId: number
    role: RuntimeWorkerRole
    state: string
    pid: number | null
    generation: number
}

export interface RuntimeServerLike {
    readonly worker_id: number | null
    readonly taskworker: boolean
    readonly setting: {
        worker_num: number
        task_worker_num: number
        user_task_worker_num?: number
    }
    readonly stopped: Promise<void>
    start(): Promise<RuntimeServerLike>
    dispose(reason?: unknown): Promise<void>
    push(fd: number, data: Uint8Array | string, opcode?: number): boolean
    close(fd: number, code?: number, reason?: string): boolean
    exist(fd: number): boolean
    requestMessage(message: unknown, targetWorkerId: number, timeoutMs?: number): Promise<unknown>
    connection_owner(fd: number): number | false
    workers(): readonly RuntimeWorkerInfo[]
    addStat(metricId: number, delta?: number): number | false
    snapshotStats(): readonly number[]
}

export interface RuntimeCallbacksLike {
    onStart?: (server: RuntimeServerLike) => void | Promise<void>
    onShutdown?: (server: RuntimeServerLike) => void | Promise<void>
    onWorkerStart?: (server: RuntimeServerLike, workerId: number) => void | Promise<void>
    onWorkerExit?: (server: RuntimeServerLike, workerId: number) => void | Promise<void>
    onWorkerStop?: (server: RuntimeServerLike, workerId: number) => void | Promise<void>
    onWorkerError?: (
        server: RuntimeServerLike,
        workerId: number,
        workerPid: number,
        exitCode: number,
        signal: number,
    ) => void | Promise<void>
    onOpen?: (server: RuntimeServerLike, request: { fd: number; [key: string]: unknown }) => void | Promise<void>
    onMessage?: (
        server: RuntimeServerLike,
        frame: { fd: number; data: Uint8Array | string; opcode: number; finish: boolean },
    ) => void | Promise<void>
    onClose?: (server: RuntimeServerLike, fd: number) => void | Promise<void>
    onPipeRequest?: (server: RuntimeServerLike, sourceWorkerId: number, message: unknown) => unknown | Promise<unknown>
}

export interface RuntimeServerConstructor {
    new (options: {
        settings: unknown
        callbacks: RuntimeCallbacksLike
        entrypoint: string
        readyTimeoutMs?: number
        gracefulShutdownTimeoutMs?: number
        terminateTimeoutMs?: number
    }): RuntimeServerLike
}
