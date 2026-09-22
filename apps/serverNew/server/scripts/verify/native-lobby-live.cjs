#!/usr/bin/env node
'use strict'

/**
 * 原生 Lobby 的「真实进程 + 真实存储 + 真实 WebSocket」自检 —— **单进程**线路。
 *
 * 与 `test/runtime/protocol/native-lobby-e2e.test.ts` 的分工是**刻意互补**的：
 * 那个测试在进程内走生产装配（假中心 Redis、假平台）；本脚本真的 fork 一次服务进程，
 * 于是「配置解析 → 单进程启动 → 真实 Redis 库 → 真实 ws 端点 → 真实模块 handler」
 * 全都参与，只有**不属于本仓**的 WebPlatform 身份服务用本地桩替代
 * （它由独立服务实现，本仓只有它的消费契约 `generated/lobby-contract/protocol/http`）。
 *
 * 断言落在真实 Redis 上（用 redis-cli 直接读，不复用生产读函数），
 * 因此「测试通过」等于「存储里真的只有一份副作用」，而不是「内存假体说只有一份」。
 *
 * 场景集在 `lobbyProtocolScenarios.cjs`，只覆盖本项目仍拥有的认证与 Bean 路由。
 *
 * 用法：
 *   node scripts/verify/native-lobby-live.cjs [-p bearjoy] [-v live] [--sid 1]
 *                                            [--native-port 18091] [--timeout-ms 240000]
 *
 * 前置：Redis 6379 与 MySQL 3306 可达；线路配置见 `config/platforms/bearjoylive/platform.json5`。
 * 退出码 0 = 全部场景通过；非 0 = 至少一条失败（明细打印在末尾）。
 */

const { results, resetResults, createHarness, fail, freePort, assertPortFree } = require('./lobbyLiveHarness.cjs')
const { runLobbyProtocolScenarios } = require('./lobbyProtocolScenarios.cjs')

function parseOptions(argv) {
    const parsed = {}
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (!token.startsWith('-')) continue
        const key = token.replace(/^-+/, '')
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('-')) parsed[key] = 'true'
        else {
            parsed[key] = next
            index += 1
        }
    }
    return parsed
}

const options = parseOptions(process.argv.slice(2))

async function main() {
    const platform = options.p ?? options.platform ?? 'bearjoy'
    const platformVersion = options.v ?? options.version ?? 'live'
    const sid = Number(options.sid ?? 1)
    const readyTimeoutMs = Number(options['timeout-ms'] ?? 240000)

    // 与 `config/platforms/bearjoylive/platform.json5` 对齐：
    // 中心库固定 9、用户库固定 8、firstClientPort 18090（内网端口派生为 28090），联调数据不落共享开发库。
    // ⚠ `userRedisDb` 必须显式给：缺省时 `h.userRedis()` 会执行 `redis-cli -n undefined`，而 redis-cli
    // 对非法 `-n` **不报错**、静默落到 db 0 ⇒ 夹具写进 0 号库、服务进程读 8 号库，症状是「登录钩子什么都没做」。
    const nativePort = Number(options['native-port'] ?? (await freePort()))
    const h = createHarness({
        platform,
        platformVersion,
        sid,
        centerRedisDb: 9,
        userRedisDb: 8,
        clientPort: 18090,
        internalPort: 28090,
        gmSecret: 'r7HpIaNXTMXaKw2',
        nativePort,
        launchMode: 'single',
    })

    console.log(
        `原生 Lobby 真实进程自检（单进程）：platform=${h.PLATFORM} version=${h.PLATFORM_VERSION} ` +
            `sid=${h.SID} run=${h.RUN_ID}`,
    )

    await assertPortFree(h.NATIVE_PORT, '原生 Lobby')
    await assertPortFree(h.INTERNAL_PORT, '内网 HTTP')
    if (h.NATIVE_PORT === h.CLIENT_PORT || h.NATIVE_PORT === h.INTERNAL_PORT) {
        fail(`原生端口 ${h.NATIVE_PORT} 不能与旧客户端端口 ${h.CLIENT_PORT} / 内网端口 ${h.INTERNAL_PORT} 相同`)
    }

    await h.platform.start()

    const server = h.startServer({
        // 私房键前缀由 `PROJECT_ID` 决定（与 GameRoom 侧同一个命名空间）；显式传给子进程，
        // 免得「脚本读到的」与「服务进程读到的」不是同一个值而断言打在两组键上。
        PROJECT_ID: h.PROJECT_ID,
        NATIVE_LOBBY_HOST: '127.0.0.1',
        NATIVE_LOBBY_PORT: String(h.NATIVE_PORT),
        WEBPLATFORM_INTERNAL_ORIGIN: h.platform.origin,
        WEBPLATFORM_SERVICE_ID: 'game-live-check',
        WEBPLATFORM_SERVICE_SECRET: `live-secret-${h.RUN_ID}`,
        // 单进程线路必须显式关掉多进程运行时：本线路的进程池配置本来就是 0，
        // 这里再钉一次，避免将来夹具被改后这条线路静默变成多进程。
        ALLOY_MULTI_PROCESS_ENABLED: '0',
        CODEBUDDY_SAFE_DELETE_ENABLED: '0',
    })

    const clients = []

    try {
        console.log(`  启动服务进程… 日志：${h.logPath}`)
        const ready = await h.waitUntilReady(readyTimeoutMs, server)
        ready.close()
        console.log(`  原生端点在 127.0.0.1:${h.NATIVE_PORT} 就绪`)

        await runLobbyProtocolScenarios(h, { clients, platform: h.platform })
    } finally {
        for (const client of clients) client.close()
        // 先挂 exit 监听再发信号：进程可能在信号之后立刻退出，晚挂会白等满整个窗口。
        const exited = new Promise((resolve) => server.child.once('exit', () => resolve(true)))
        server.child.kill('SIGTERM')
        const graceful = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(false), 15000))])
        if (!graceful) server.child.kill('SIGKILL')
        server.stream.end()
        await h.platform.stop()
    }

    const failed = results.filter((result) => !result.ok)
    console.log('')
    console.log(`场景：${results.length - failed.length}/${results.length} 通过`)
    if (failed.length) {
        console.log('失败明细：')
        for (const result of failed) console.log(`  - ${result.name}: ${result.detail}`)
    }
    console.log(`日志：${h.logPath}`)
    console.log(`本次数据在 Redis db ${h.CENTER_REDIS_DB}（中心）；如需清理：redis-cli -n ${h.CENTER_REDIS_DB} flushdb`)
    console.log(`关键键：nativeLobby:identity:v1 / User_<internalUid> / IdGenerater:user:${h.SID}`)
    process.exit(failed.length ? 1 : 0)
}

resetResults()
main().catch((error) => {
    console.error(`自检失败：${(error && error.stack) || error}`)
    process.exit(1)
})
