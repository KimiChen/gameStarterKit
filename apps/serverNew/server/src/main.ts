import { E_APP_TYPE, EngineInitHelper, isRuntimeChildProcess } from '@arthropoda/game-engine'
import { initializeApplication, initializeLaunchConfiguration } from './startup/initializeApplication'
import { initializeServiceRuntime, shutdownServiceRuntime } from './startup/ServiceRuntime'
import { resolveLaunchMode } from './startup/launchMode'
import { InternalHttpServer } from './runtime/http/InternalHttpServer'
import { executeInternalAction } from './runtime/action/executeInternalAction'

process.on('unhandledRejection', (reason) => {
    if (Object.hasOwn(global, 'Log')) Log.error('Promise Rejection 没有被处理,请找看看哪里没有await,错误:%s', reason)
    else console.error('Promise Rejection 没有被处理,请找看看哪里没有await,错误:%s', reason)
})

async function runSingleProcess() {
    EngineInitHelper.initProcessInfo({ workerId: 0, role: 'SINGLE', workerNum: 0, taskWorkerNum: 0 })
    await initializeApplication({ appType: E_APP_TYPE.SERVICE, launchConfigurationLoaded: true })
    await initializeServiceRuntime({ directNetwork: true, runSchedulers: true })
    const internalServer = new InternalHttpServer({
        host: CP.service.internalHost,
        port: CP.service.internalPort,
        secret: CP.platform.gmSecret ?? '',
        health: () => ({ status: 200, body: { ok: true, launchMode: 'single', pid: process.pid } }),
        action: (payload, remoteAddress) => executeInternalAction(payload, remoteAddress),
    })
    await internalServer.start()
    console.log(
        `fixed sid ${SERVER_ID} launchMode=single workerNum=0 taskWorkerNum=0 ` +
            `internal=${CP.service.internalHost}:${CP.service.internalPort}`,
    )

    let stopping = false
    const shutdown = async (signal: string) => {
        if (stopping) return
        stopping = true
        console.log(`received ${signal}, stopping fixed server`)
        await internalServer.stop()
        await shutdownServiceRuntime()
    }
    process.on('SIGINT', () => shutdown('SIGINT').catch((error) => console.error(error)))
    process.on('SIGTERM', () => shutdown('SIGTERM').catch((error) => console.error(error)))
}

async function main() {
    initializeLaunchConfiguration({ appType: E_APP_TYPE.SERVICE })
    const configuredMode = resolveLaunchMode(
        CP.service.workerNum,
        CP.service.taskWorkerNum,
        CP.service.userTaskWorkerNum,
    )
    const launchMode = isRuntimeChildProcess() ? 'multi' : configuredMode
    if (
        configuredMode === 'single' &&
        (CP.service.workerNum !== 0 || CP.service.taskWorkerNum !== 0 || CP.service.userTaskWorkerNum !== 0)
    ) {
        console.warn(
            `ALLOY_MULTI_PROCESS_ENABLED=0，配置 workerNum=${CP.service.workerNum} ` +
                `taskWorkerNum=${CP.service.taskWorkerNum} 暂按单进程启动`,
        )
    }
    if (launchMode === 'single') {
        await runSingleProcess()
        return
    }
    const entrypoint = process.env.ALLOY_RUNTIME_ENTRYPOINT ?? process.argv[1]
    if (!entrypoint) throw new Error('多进程启动缺少 entrypoint')
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { runMultiProcessRuntime } =
        require('./startup/MultiProcessRuntime') as typeof import('./startup/MultiProcessRuntime')
    /* eslint-enable @typescript-eslint/no-var-requires */
    await runMultiProcessRuntime(entrypoint)
}

main().catch((error) => {
    console.dir(error, { depth: 12 })
    process.exitCode = 1
})
