import { NativeKitSnapshot } from './NativeKitSnapshot'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { program } from 'commander'
import { AtomicHashTransaction, Config, E_APP_TYPE, EngineInitHelper, log } from '@arthropoda/game-engine'
import { initializeLaunchConfiguration } from '../../startup/initializeApplication'
import { NativeKitLifecycle } from './NativeKitLifecycle'
import type { NativeKitMaintenancePort } from './NativeKitMaintenancePort'

const loadModule = createRequire(__filename)

program
    .requiredOption('--kit <id>', '原生 kit ID')
    .requiredOption('--operation <operation>', 'status | drain | resume | cancel | detach | attach | snapshot')
    .option('--storage-keys <json>', '安装器提供的持久化 key 契约')
    .option('--data-version <version>', '安装器提供的数据版本')
    .option('--min-supported <version>', '安装器提供的最低数据版本')
    .option('--timeout-ms <milliseconds>', '排空等待上限', '180000')

async function main(): Promise<void> {
    initializeLaunchConfiguration({ appType: E_APP_TYPE.DEFAULT })
    const options = program.opts<{
        kit: string
        operation: string
        timeoutMs: string
        dataVersion?: string
        storageKeys?: string
        minSupported?: string
    }>()
    if (
        !/^[a-z][A-Za-z0-9]{0,63}$/.test(options.kit) ||
        !['status', 'drain', 'resume', 'cancel', 'detach', 'attach', 'snapshot'].includes(options.operation)
    )
        throw new Error('invalid native kit command')
    const timeout = Number(options.timeoutMs)
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error('invalid drain timeout')
    log.init(CP.platform.log)
    const serverRedis = Config.resolveServerRedisConf(CP.platform.serverRedis, CP.service.serverRedis)
    await EngineInitHelper.initRedisInstance(CP.platform.centerRedis, serverRedis, CP.platform.userRedis)
    try {
        if (options.dataVersion !== undefined) {
            if (!['status', 'detach', 'attach', 'snapshot'].includes(options.operation))
                throw new Error('invalid installer operation')
            const lifecycle = new NativeKitLifecycle(
                options.kit,
                Number(options.dataVersion),
                Number(options.minSupported ?? options.dataVersion),
            )
            if (options.operation === 'detach') {
                const storageKeys: unknown = options.storageKeys ? JSON.parse(options.storageKeys) : undefined
                if (
                    storageKeys !== undefined &&
                    (!Array.isArray(storageKeys) || storageKeys.some((key) => typeof key !== 'string'))
                )
                    throw new Error('invalid storage keys')
                await lifecycle.detach(storageKeys as string[] | undefined)
            } else if (options.operation === 'attach') {
                const { GameModuleCatalog } = loadModule(
                    '../../startup/GameModuleCatalog',
                ) as typeof import('../../startup/GameModuleCatalog')
                if (!GameModuleCatalog.registry.some((entry) => entry.moduleName === options.kit))
                    throw new Error('installed module registry is missing')
                await lifecycle.attach()
            }
            const state = (await AtomicHashTransaction.run((tx) => lifecycle.state(tx))) ?? { phase: 'absent' }
            const snapshot =
                options.operation === 'snapshot'
                    ? await NativeKitSnapshot.read(lifecycle, JSON.parse(options.storageKeys ?? '[]'))
                    : undefined
            const result = { kit: options.kit, operation: options.operation, state, ...(snapshot ? { snapshot } : {}) }
            console.log(`[native-kit-result] ${JSON.stringify(result)}`)
            return
        }
        if (['attach', 'detach', 'snapshot'].includes(options.operation))
            throw new Error('installer operation requires data version')
        const { GameModuleCatalog } = loadModule(
            '../../startup/GameModuleCatalog',
        ) as typeof import('../../startup/GameModuleCatalog')
        if (!GameModuleCatalog.registry.some((entry) => entry.moduleName === options.kit))
            throw new Error('native kit module not installed')
        // The only dynamic business import is the requested module's public operator port.
        const modulePath = path.resolve(__dirname, '../../modules', options.kit, 'api/lifecycle/NativeKitMaintenance')
        const port = (loadModule(modulePath) as { NativeKitMaintenance?: NativeKitMaintenancePort })
            .NativeKitMaintenance
        if (
            !port ||
            port.version !== 1 ||
            ['status', 'drain', 'resume', 'cancel'].some(
                (name) => typeof port[name as keyof NativeKitMaintenancePort] !== 'function',
            )
        )
            throw new Error('native kit maintenance API v1 is unavailable')
        if (options.operation === 'drain') {
            const deadline = Date.now() + timeout
            const owner = randomUUID()
            let previous = ''
            while (Date.now() < deadline) {
                const report = await port.drain(owner)
                const serialized = JSON.stringify(report)
                if (serialized !== previous) console.log(`[native-kit-progress] ${serialized}`)
                previous = serialized
                if (report.phase === 'drained') break
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
            if ((await port.status()).phase !== 'drained')
                throw new Error(
                    'drain timed out; kit stays closed, rerun drain or cancel after the owner lease expires',
                )
        } else if (options.operation === 'resume') await port.resume()
        else if (options.operation === 'cancel') await port.cancel(randomUUID())
        console.log(
            `[native-kit-result] ${JSON.stringify({ kit: options.kit, operation: options.operation, state: await port.status() })}`,
        )
    } finally {
        await EngineInitHelper.stopInfrastructure()
    }
}
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
