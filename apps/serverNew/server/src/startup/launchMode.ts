export type LaunchMode = 'single' | 'multi'

export function resolveLaunchMode(workerNum: number, taskWorkerNum: number, userTaskWorkerNum = 0): LaunchMode {
    if (workerNum === 0 && taskWorkerNum === 0 && userTaskWorkerNum === 0) return 'single'
    if (process.env.ALLOY_MULTI_PROCESS_ENABLED === '0') return 'single'
    return 'multi'
}
