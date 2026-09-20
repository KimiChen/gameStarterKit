import assert from 'node:assert/strict'
import net from 'node:net'
import { nativeLobbyProcessRoutes } from '../../src/runtime/lobby/NativeLobbyProcessRoutes'
import {
    initializeServiceRuntime,
    nativeLobbyRuntime,
    rollbackServiceRuntimeStart,
} from '../../src/startup/ServiceRuntime'

/**
 * 服务运行时**启动失败必须整段回滚**（P5 验收：「禁止静默降级单进程掩盖问题」）。
 *
 * 原生入口的失败发生在中间步骤：角色校验、端点绑定、路由装载。`initialized` 是模块级状态，
 * 不回滚就会留下「自称已初始化、实际是半成品」的进程——旧通道可用、原生入口缺席、
 * 路由表可能已装载，而重试会被 `'service runtime already initialized'` 提前挡住，
 * 真正的失败原因永远看不到。
 *
 * 三种失败模式各覆盖一条分支：
 * - 监听 + 配置被拒（尚未装载路由）；
 * - 监听 + 端口被占（**已经装载路由**，回滚必须卸载）；
 * - 转发 + 配置不完整（转发分支）；
 * - 配置了原生入口却没有角色（在客户端网关建立之前的校验分支）。
 */

const SID = 7
/** 与 `CP.service.clientPort` 相同，用于触发端口冲突这条配置错误。 */
const COLLIDING_PORT = '41901'

const CONFIG_NAMES = [
    'NATIVE_LOBBY_HOST',
    'NATIVE_LOBBY_PORT',
    'WEBPLATFORM_INTERNAL_ORIGIN',
    'WEBPLATFORM_SERVICE_ID',
    'WEBPLATFORM_SERVICE_SECRET',
] as const

describe('service runtime native Lobby bring-up', () => {
    let savedEnv: Array<string | undefined>
    let savedGlobals: Record<string, unknown>

    before(() => {
        savedGlobals = {
            Log: (globalThis as Record<string, unknown>).Log,
            PLATFORM: (globalThis as Record<string, unknown>).PLATFORM,
            CP: (globalThis as Record<string, unknown>).CP,
            SERVER_ID: (globalThis as Record<string, unknown>).SERVER_ID,
            ADJUST_OPEN: (globalThis as Record<string, unknown>).ADJUST_OPEN,
        }
        const noop = () => undefined
        const logger = { debug: noop, info: noop, warn: noop, error: noop, crit: noop }
        const globals = globalThis as Record<string, unknown>
        globals.Log = new Proxy(logger, { get: (target, key) => Reflect.get(target, key) ?? logger })
        globals.PLATFORM = 'bearjoy'
        // 让 `persistence-ready` 阶段的 AdjustConfigLoader 成为 no-op：本文件验证的是启动顺序与回滚，
        // 不是活动配置加载，不能因为本地没有测试配置而先失败在别处。
        globals.ADJUST_OPEN = false
        globals.SERVER_ID = SID
        globals.CP = {
            platform: { gmSecret: 'gm-secret' },
            service: {
                sid: SID,
                clientHost: '127.0.0.1',
                clientPort: Number(COLLIDING_PORT),
                internalPort: 41902,
                heartbeatTimeoutMs: 60_000,
                authTimeoutMs: 30_000,
                maxPacketSize: 102_400,
            },
        }
    })

    after(() => {
        for (const [name, value] of Object.entries(savedGlobals)) {
            if (value === undefined) delete (globalThis as Record<string, unknown>)[name]
            else (globalThis as Record<string, unknown>)[name] = value
        }
    })

    beforeEach(() => {
        savedEnv = CONFIG_NAMES.map((name) => process.env[name])
        CONFIG_NAMES.forEach((name) => delete process.env[name])
    })

    afterEach(() => {
        CONFIG_NAMES.forEach((name, index) => {
            const value = savedEnv[index]
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
        })
        // 安全网：任何用例留下半初始化状态都会污染同进程里的其它启动用例。
        rollbackServiceRuntimeStart()
    })

    function applyEnvironment(values: Partial<Record<(typeof CONFIG_NAMES)[number], string>>): void {
        for (const [name, value] of Object.entries(values)) process.env[name] = value
    }

    /** 一份完整的原生入口配置；配置完整性校验先于端口校验，所以冲突用例也必须给全。 */
    function applyCompleteEnvironment(port: string): void {
        applyEnvironment({
            NATIVE_LOBBY_HOST: '127.0.0.1',
            NATIVE_LOBBY_PORT: port,
            WEBPLATFORM_INTERNAL_ORIGIN: 'http://127.0.0.1:1',
            WEBPLATFORM_SERVICE_ID: 'game-test',
            WEBPLATFORM_SERVICE_SECRET: 'test-secret',
        })
    }

    /**
     * 可观察面都必须回到「未初始化」；任一个留在半成品状态就是静默降级。
     * 旧二进制网关（`clientGateway`）已随 P6 删除，剩下的两个可观察面，加上每个用例里
     * 「重试能再次走到真正的失败原因而不是 `already initialized`」，共同构成证据。
     */
    function assertRuntimeUninitialized(): void {
        assert.equal(nativeLobbyRuntime(), undefined)
        assert.equal(nativeLobbyProcessRoutes.installed, false)
    }

    it('rolls back when the listener configuration is rejected before any route is loaded', async () => {
        applyCompleteEnvironment(COLLIDING_PORT)

        const options = { directNetwork: false, runSchedulers: false, nativeLobby: { role: 'listen' as const } }
        await assert.rejects(
            () => initializeServiceRuntime(options),
            /NATIVE_LOBBY_PORT must differ from legacy client, internal and probe ports/,
        )
        assertRuntimeUninitialized()

        // 关键断言：失败没有被「已初始化」状态掩盖。没有回滚时这里会先撞上
        // 'service runtime already initialized'，真正的失败原因被替换掉。
        await assert.rejects(
            () => initializeServiceRuntime(options),
            /NATIVE_LOBBY_PORT must differ from legacy client, internal and probe ports/,
        )
        assertRuntimeUninitialized()
    })

    it('unloads the route table when the listener fails after the routes were installed', async () => {
        const occupied = net.createServer()
        await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
        const port = (occupied.address() as net.AddressInfo).port
        try {
            applyCompleteEnvironment(String(port))

            // 端口被占是真实的部署失败形态，且它发生在**路由装载之后**：
            // 装配顺序是「装载路由表 → 绑定端点」，所以这条路径才验证得到路由表卸载。
            await assert.rejects(
                () =>
                    initializeServiceRuntime({
                        directNetwork: false,
                        runSchedulers: false,
                        nativeLobby: { role: 'listen' },
                    }),
                (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE',
            )
            assertRuntimeUninitialized()
        } finally {
            await new Promise<void>((resolve) => occupied.close(() => resolve()))
        }
    })

    it('fails closed when a forwarding worker gets an incomplete native Lobby configuration', async () => {
        // 只给一半变量：`hasNativeLobbyEnvironment` 判为「已配置」，装配必须直接报错，
        // ⛔ 不能因为配置不全就悄悄不装载路由——那会让该 worker 上的转发请求全部落到
        // 「目标进程未装载原生 Lobby 路由」或者更糟的静默执行。
        applyEnvironment({ NATIVE_LOBBY_HOST: '127.0.0.1' })

        await assert.rejects(
            () =>
                initializeServiceRuntime({
                    directNetwork: false,
                    runSchedulers: false,
                    nativeLobby: { role: 'forward', forwardPush: async () => false },
                }),
            /native Lobby configuration is incomplete: missing/,
        )
        assertRuntimeUninitialized()
    })

    it('refuses to start when the native entry is configured but this process has no role', async () => {
        applyEnvironment({ NATIVE_LOBBY_PORT: COLLIDING_PORT })

        // 多进程装配漏传 nativeLobby 时必须直接失败，而不是「没角色 = 不参与」地静默降级。
        await assert.rejects(
            () => initializeServiceRuntime({ directNetwork: false, runSchedulers: false }),
            /native Lobby is configured but this process has no Lobby role assigned/,
        )
        assertRuntimeUninitialized()

        // 同一缺陷的第二个面：这条失败发生在客户端网关建立之前，回滚同样必须生效。
        await assert.rejects(
            () => initializeServiceRuntime({ directNetwork: false, runSchedulers: false }),
            /native Lobby is configured but this process has no Lobby role assigned/,
        )
    })
})
