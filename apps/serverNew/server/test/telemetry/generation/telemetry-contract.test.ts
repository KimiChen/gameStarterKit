import assert from 'assert'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { E_APP_TYPE } from '@arthropoda/game-engine'
import { TaCommonUser } from '../../../generated/telemetry/models/TaCommonUser'
import { TaskTelemetryProperties } from '../../../src/modules/task/telemetry/TaskTelemetryProperties'
import type { User } from '../../../src/modules/user/bean/User'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { UserTelemetryProperties } from '../../../src/modules/user/telemetry/UserTelemetryProperties'
import { TelemetryBatchState } from '../../../src/telemetry/TelemetryBatchState'
import { TelemetryEventFormatter } from '../../../src/telemetry/TelemetryEventFormatter'
import { TelemetryPropertiesRegistry } from '../../../src/telemetry/TelemetryPropertiesRegistry'

describe('Telemetry contract', () => {
    /**
     * 本套件改的是**进程级 global**，而整套 TS 测试跑在同一个进程里（`test/run-tests.js`
     * 把各套件的 TS 文件合并成一次 mocha 运行）。⛔ 不还原 `APP_TYPE` 会污染后面所有套件：
     * engine 的 `getDifferCache` 靠「`APP_TYPE` 未定义」判定「本进程没有服务端上下文」，
     * 一旦被置成 SERVICE 又没有注入 contextFactory，它会按设计抛 `waiting inject`，
     * 于是 runtime 那批用例会以 `waiting inject` 全红——看起来像业务坏了，其实是这里漏了收尾。
     */
    const savedGlobals: Record<string, unknown> = {}

    before(() => {
        for (const name of ['PLATFORM', 'APP_TYPE', 'C']) savedGlobals[name] = (globalThis as any)[name]
    })

    after(() => {
        for (const [name, value] of Object.entries(savedGlobals)) {
            if (value === undefined) delete (globalThis as any)[name]
            else (globalThis as any)[name] = value
        }
    })

    beforeEach(() => {
        ;(globalThis as any).PLATFORM = 'bearjoy'
        ;(globalThis as any).APP_TYPE = E_APP_TYPE.SERVICE
        ;(globalThis as any).C = {
            main_task: Object.assign(
                (id?: number) =>
                    id === undefined ? new Map([[1001, { type: 999, value: 5 }]]) : { type: 999, value: 5 },
                {},
            ),
        }
        TelemetryBatchState.taCommonUsers = {}
        TelemetryPropertiesRegistry.setProviders([new UserTelemetryProperties(), new TaskTelemetryProperties()])
    })

    it('keeps generated event and model semantics unchanged', () => {
        assert.strictEqual(semanticModelHash(), '0f3e09dee6c697a5c03a20b26ec7dec44dc9199828d26d110be1f48678caa7ab')
        assert.strictEqual(semanticEventHash(), '46825b2ee7ea60f112bb4dcf5d2f99912210c2ad7262a02272e4970793f3912e')
    })

    it('registers user and task property providers in a stable order', () => {
        assert.deepStrictEqual(TelemetryPropertiesRegistry.providerNames(), ['user', 'task'])
        assert.throws(
            () =>
                TelemetryPropertiesRegistry.setProviders([
                    new UserTelemetryProperties(),
                    new UserTelemetryProperties(),
                ]),
            /must be unique/,
        )
    })

    it('preserves public user and task property values', () => {
        const user = {
            id: 30001060665,
            taVersion: 7,
            deviceId: 'device-1',
            openid: 'account-1',
            sId: 3,
            name: 'role-1',
            lv: 18,
            vip: 2,
            realmUpFp: 4567,
            gc: 89,
            mainTaskId: 1001,
            mainTaskProgress: 5,
        } as User

        const properties = UserTelemetryContext.reloadPublicProperties(user, 7)

        assert.deepStrictEqual(pickPublicProperties(properties), {
            taVersion: 7,
            device_id: 'device-1',
            role_source: '',
            open_id: 'account-1',
            account_id: '30001060665',
            server_id: '3',
            mix_id: '',
            line_id: 'bearjoy',
            role_name: 'role-1',
            role_level: 18,
            role_vip_level: 2,
            role_fp: 4567,
            current_gc: 89,
            maintask_id: 1001,
            maintask_status: '完成',
        })
    })

    it('preserves important-field formatting and event payload keys', () => {
        const publicProperties = new TaCommonUser()
        publicProperties.event_time = 1700000000
        publicProperties.device_id = 'device-1'
        publicProperties.account_id = '30001060665'
        publicProperties.role_name = 'role-1'

        const formatted = TelemetryEventFormatter.format(
            {
                EVENT_NAME: 'item_change',
                change: 5,
                reason: 'test',
                _important: { change: '1' },
            },
            publicProperties,
        )

        assert.strictEqual(formatted.EVENT_NAME, 'item_change')
        assert.strictEqual(formatted['#change'], 5)
        assert.strictEqual(formatted.reason, 'test')
        assert.strictEqual(formatted['#event_time'], 1700000000)
        assert.strictEqual(formatted['#device_id'], 'device-1')
        assert.strictEqual(formatted['#account_id'], '30001060665')
        assert.strictEqual(formatted.role_name, 'role-1')
    })

    it('does not activate the existing batch timer implicitly', () => {
        const sourceRoot = path.resolve(process.cwd(), 'src')
        const callers = walkTypeScriptFiles(sourceRoot)
            .filter((filePath) => !filePath.endsWith('/telemetry/TelemetryBatchState.ts'))
            .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('TelemetryBatchState.startTick('))

        assert.deepStrictEqual(callers, [])
    })
})

function pickPublicProperties(properties: TaCommonUser) {
    return {
        taVersion: properties.taVersion,
        device_id: properties.device_id,
        role_source: properties.role_source,
        open_id: properties.open_id,
        account_id: properties.account_id,
        server_id: properties.server_id,
        mix_id: properties.mix_id,
        line_id: properties.line_id,
        role_name: properties.role_name,
        role_level: properties.role_level,
        role_vip_level: properties.role_vip_level,
        role_fp: properties.role_fp,
        current_gc: properties.current_gc,
        maintask_id: properties.maintask_id,
        maintask_status: properties.maintask_status,
    }
}

function semanticModelHash() {
    const root = path.resolve(process.cwd(), 'generated/telemetry/models')
    const models = walkTypeScriptFiles(root).map((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8')
        const className = content.match(/export class (\w+)/)?.[1]
        const properties = [
            ...content.matchAll(/public (?:static readonly |readonly )?(\w+)(?:: ([^=\n]+))?\s*=\s*([^\n]+)/g),
        ].map((match) => [match[1], (match[2] ?? '').trim(), match[3].trim()])
        return [path.relative(root, filePath), className, properties]
    })
    return createHash('sha256').update(JSON.stringify(models)).digest('hex')
}

function semanticEventHash() {
    const root = path.resolve(process.cwd(), 'generated/telemetry')
    const events = walkTypeScriptFiles(root)
        .filter((filePath) => !filePath.includes('/models/'))
        .map((filePath) => {
            const content = fs.readFileSync(filePath, 'utf8')
            const signature = content.match(/export (?:async )?function (\w+)\(([^)]*)\)/)
            return [path.relative(root, filePath), signature?.[1], signature?.[2]?.replace(/\s+/g, ' ').trim()]
        })
    return createHash('sha256').update(JSON.stringify(events)).digest('hex')
}

function walkTypeScriptFiles(directory: string): string[] {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const filePath = path.join(directory, entry.name)
            if (entry.isDirectory()) return walkTypeScriptFiles(filePath)
            return entry.isFile() && filePath.endsWith('.ts') ? [filePath] : []
        })
        .sort()
}
