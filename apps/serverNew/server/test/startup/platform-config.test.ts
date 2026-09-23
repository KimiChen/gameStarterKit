import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Config, IPlatformConfigMap } from '@arthropoda/game-engine'
import { FixedServerEndpoint } from '../../src/http/FixedServerEndpoint'

describe('platform config fallback', () => {
    let tempRoot: string
    let originalRootPath: string
    let originalPlatform: string
    let originalPlatformTag: string
    let originalServerId: number
    let originalConfigSpaces: unknown
    let originalCP: IPlatformConfigMap

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-platform-config-'))
        originalRootPath = global.ROOT_PATH
        originalPlatform = global.PLATFORM
        originalPlatformTag = global.PLATFORM_TAG
        originalServerId = global.SERVER_ID
        originalConfigSpaces = (Config as any).spaces
        originalCP = global.CP

        global.ROOT_PATH = tempRoot
        global.PLATFORM = 'bearjoy'
        global.PLATFORM_TAG = 'bearjoydev'
        global.SERVER_ID = 2
        ;(Config as any).spaces = { default: { confMap: {}, lastAccessTime: 0 } }
        global.CP = new Proxy({} as IPlatformConfigMap, {
            get(_target, property) {
                return Config.getConfig(String(property))
            },
        })
        fs.mkdirSync(path.join(tempRoot, 'config', 'platforms', 'bearjoy'), { recursive: true })
        fs.writeFileSync(
            path.join(tempRoot, 'config', 'platform.json5'),
            `{
                source: 'base',
                serverRedis: {
                    host: '127.0.0.1',
                    port: 6379,
                    database: 1,
                },
                fixedServer: {
                    clientHost: '127.0.0.1',
                    firstClientPort: 20001,
                    heartbeatTimeoutMs: 60000,
                    authTimeoutMs: 30000,
                    maxPacketSize: 102400,
                },
            }`,
        )
        fs.writeFileSync(
            path.join(tempRoot, 'config', 'platforms', 'bearjoy', 'platform.json5'),
            `{ source: 'wrong-fallback' }`,
        )
        fs.writeFileSync(
            path.join(tempRoot, 'config', 'platforms', 'bearjoy', 's2.json5'),
            `{ sid: 2, clientHost: 'wrong-fallback', clientPort: 18081 }`,
        )
    })

    afterEach(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true })
        global.ROOT_PATH = originalRootPath
        global.PLATFORM = originalPlatform
        global.PLATFORM_TAG = originalPlatformTag
        global.SERVER_ID = originalServerId
        ;(Config as any).spaces = originalConfigSpaces
        global.CP = originalCP
    })

    it('uses base defaults when the exact platform tag directory is absent', () => {
        Config.loadAllConf(true)

        assert.equal((CP.platform as any).source, 'base')
        assert.deepEqual(CP.service, {
            sid: 2,
            clientHost: '127.0.0.1',
            clientPort: 20002,
            internalHost: '0.0.0.0',
            internalPort: 30002,
            healthPort: 40002,
            heartbeatTimeoutMs: 60000,
            authTimeoutMs: 30000,
            maxPacketSize: 102400,
            workerNum: 2,
            taskWorkerNum: 2,
            userTaskWorkerNum: 0,
            serverRedis: {
                host: '127.0.0.1',
                port: 6379,
                database: 2,
            },
        })
        assert.deepEqual(FixedServerEndpoint.get(2), {
            sid: 2,
            host: '127.0.0.1',
            port: 20002,
            internalHost: '127.0.0.1',
            internalPort: 30002,
            healthPort: 40002,
        })
        assert.equal(FixedServerEndpoint.configPath('platform.json5'), path.join(tempRoot, 'config', 'platform.json5'))
    })

    it('applies exact platform and optional per-server overrides', () => {
        const exactDirectory = path.join(tempRoot, 'config', 'platforms', 'bearjoydev')
        fs.mkdirSync(exactDirectory, { recursive: true })
        fs.writeFileSync(path.join(exactDirectory, 'platform.json5'), `{ source: 'exact' }`)
        fs.writeFileSync(path.join(exactDirectory, 's2.json5'), `{ clientHost: '192.0.2.2', clientPort: 24002 }`)

        Config.loadAllConf(true)

        assert.equal((CP.platform as any).source, 'exact')
        assert.deepEqual(CP.service, {
            sid: 2,
            clientHost: '192.0.2.2',
            clientPort: 24002,
            internalHost: '0.0.0.0',
            internalPort: 34002,
            healthPort: 44002,
            heartbeatTimeoutMs: 60000,
            authTimeoutMs: 30000,
            maxPacketSize: 102400,
            workerNum: 2,
            taskWorkerNum: 2,
            userTaskWorkerNum: 0,
        })
        assert.deepEqual(Config.resolveServerRedisConf(CP.platform.serverRedis, CP.service.serverRedis), {
            host: '127.0.0.1',
            port: 6379,
            database: 1,
        })
        assert.deepEqual(FixedServerEndpoint.get(3), {
            sid: 3,
            host: '127.0.0.1',
            port: 20003,
            internalHost: '127.0.0.1',
            internalPort: 30003,
            healthPort: 40003,
        })
    })

    it('allows an exact per-server Redis database override', () => {
        const exactDirectory = path.join(tempRoot, 'config', 'platforms', 'bearjoydev')
        fs.mkdirSync(exactDirectory, { recursive: true })
        fs.writeFileSync(path.join(exactDirectory, 's2.json5'), `{ serverRedis: { database: 9 } }`)

        Config.loadAllConf(true)

        assert.deepEqual(Config.resolveServerRedisConf(CP.platform.serverRedis, CP.service.serverRedis), {
            host: '127.0.0.1',
            port: 6379,
            database: 9,
        })
    })

    it('keeps the single-process launch mode when both pool sizes are 0', () => {
        fs.writeFileSync(
            path.join(tempRoot, 'config', 'platform.json5'),
            `{
                serverRedis: { host: '127.0.0.1', port: 6379, database: 1 },
                fixedServer: {
                    clientHost: '127.0.0.1',
                    firstClientPort: 20001,
                    heartbeatTimeoutMs: 60000,
                    authTimeoutMs: 30000,
                    maxPacketSize: 102400,
                    workerNum: 0,
                    taskWorkerNum: 0,
                },
            }`,
        )

        Config.loadAllConf(true)

        assert.equal(CP.service.workerNum, 0)
        assert.equal(CP.service.taskWorkerNum, 0)
    })

    it('rejects a task worker pool without event workers', () => {
        fs.writeFileSync(
            path.join(tempRoot, 'config', 'platform.json5'),
            `{
                serverRedis: { host: '127.0.0.1', port: 6379, database: 1 },
                fixedServer: {
                    clientHost: '127.0.0.1',
                    firstClientPort: 20001,
                    heartbeatTimeoutMs: 60000,
                    authTimeoutMs: 30000,
                    maxPacketSize: 102400,
                    workerNum: 0,
                    taskWorkerNum: 2,
                },
            }`,
        )

        assert.throws(() => Config.loadAllConf(true), /workerNum 为 0 时其他进程池必须也是 0/)
    })
})
