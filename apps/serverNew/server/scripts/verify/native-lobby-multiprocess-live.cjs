#!/usr/bin/env node
'use strict'

/**
 * 原生 Lobby 的**真实多进程宿主**自检。
 *
 * 与 `native-lobby-live.cjs`（单进程线路）的关系是刻意的：两者跑**同一份协议场景集**
 * （`lobbyProtocolScenarios.cjs`），因此 P5 验收里的「单进程和多进程的同一组协议用例行为一致」
 * 是同一份代码跑两个拓扑，而不是两份脚本各自宣布自己绿。
 *
 * 本脚本额外证明的，是**只有真实多进程宿主才能证明**的七件事：
 *   1. 进程池真的 fork 出来了，四种角色（`WORKER` / `TASK_WORKER` / `USER_TASK_WORKER`）都就位，
 *      且**恰好一个**进程绑定原生端点 —— 用 `/health` 给出的 `workerId → pid` 映射与 `lsof` 的
 *      端口归属**交叉核对**，不是「配置里写了几个 worker」；
 *   2. 旧二进制客户端端口仍然在听，但连接会被 **1008** 显式关闭（不静默丢帧）；
 *   3. 一次业务写（`guild.join`，按 guildId 声明了 bindId）**真的跨了进程**：请求从监听进程
 *      转到 task worker 执行，领域推送再从 task worker 转回监听进程才写到 wire；
 *   4. `bindId % taskWorkerNum` 真的产生**分布**（`taskWorkerNum > 1` 时不同 guildId 落到不同
 *      task worker），而不是退化成常量落点；
 *   5. 运营入口（内部 HTTP 端点）落在**监听进程**上，而不是主控进程 —— alloy-core 的 worker 侧
 *      只接受「源角色是 worker」的进程请求，主控发出去的请求会被丢弃、调用方只能等到超时；
 *   6. 一个 worker 被硬杀后**能被自动补齐**；监听 worker 重拉期间主控独立探针仍可用 —— 崩溃重拉是
 *      「进程池」这套设计唯一无法靠配置证明的部分；
 *   7. **用户任务真的落到 user task worker 上执行**：按 uid 哈希在多个 user task worker 之间
 *      产生分布，且「执行者」用**目标进程自己打出的 pid** 与 `/health` 的槽位归属交叉核对。
 *      这一条同时是 `USER_TASK_WORKER` 角色的存在理由——在此之前它只是一个不绑端点、
 *      不抢调度器的结构占位。
 *
 * 3/4/7 的判据是 `ALLOY_PROCESS_ROUTE_TRACE=1` 打出的 `[alloy-process-route]` 痕迹；5 的判据是
 * **端口归属**（`lsof`）+「不得出现 kick 痕迹」；6 的判据是 `/health` 的 `generation` 恰好 +1
 * （只在重新 fork 同一槽位时递增）+ 新 pid 存活 + 重拉后跨进程链路仍通。多进程下「谁把请求
 * 发给了谁」从外部看不见（端点只属于监听进程，目标 worker 不写 wire），没有外部可观测的判据
 * 就只能靠「行为看起来对」推断，而推断不能作为跨进程可用性的证据。
 *
 * ⚠ 7 的痕迹有**两条**，缺一不可：`event: 'route'` 由源进程在 `requestMessage` **之前**打出，
 * 只能证明「发起了转发」；`event: 'exec'` 由目标进程在自己执行的那一刻打出并带上自己的 pid，
 * 才是「真的在它上面执行了」。只留前者会让「转发被丢弃、调用方超时」也看起来像通过。
 *
 * 用法：
 *   node scripts/verify/native-lobby-multiprocess-live.cjs [--native-port 18091] [--timeout-ms 300000]
 *
 * 前置：
 *   - Redis 6379 与 MySQL 3306 可达；
 *   - 线路配置 `config/platforms/bearjoylivemulti/platform.json5`
 *     （workerNum=1 + taskWorkerNum=2 + userTaskWorkerNum=2；两个池都 >1 才谈得上分布）；
 *   - alloy-core 运行时 bundle `build/alloy-core/index.mjs` 存在。它由 `pnpm build:runtime` 生成，
 *     而该命令需要同级仓 `alloy-core` 的源码 —— 本机若没有源码，**只能用已有的 bundle**，
 *     这里会显式失败并给出提示，而不是静默跳过整个多进程验证。
 *
 * 退出码 0 = 全部场景通过；非 0 = 至少一条失败（明细打印在末尾）。
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { WebSocket } = require('ws')

const {
    results,
    resetResults,
    createHarness,
    fail,
    check,
    equal,
    deepEqual,
    scenario,
    freePort,
    assertPortFree,
    childPidsOf,
    isAlive,
    getHealth,
    getProbe,
} = require('./lobbyLiveHarness.cjs')
const { runLobbyProtocolScenarios } = require('./lobbyProtocolScenarios.cjs')

/** 与 `config/platforms/bearjoylivemulti/platform.json5` 对齐。 */
const PLATFORM = 'bearjoy'
const PLATFORM_VERSION = 'livemulti'
const SID = 1
const CENTER_REDIS_DB = 6
/** `User` 这类 Hash bean 的落点；与中心库错开（夹具 `userRedis.database`）。 */
const USER_REDIS_DB = 5
const CLIENT_PORT = 18095
const INTERNAL_PORT = 28095
const HEALTH_PORT = 38095
const GM_SECRET = 'r7HpIaNXTMXaKw2'
/** 夹具里声明的进程池规模；断言必须与配置对得上，否则「多进程」可能只是名字叫多进程。 */
const WORKER_NUM = 1
const TASK_WORKER_NUM = 2
const USER_TASK_WORKER_NUM = 2
const EXPECTED_WORKERS = WORKER_NUM + TASK_WORKER_NUM + USER_TASK_WORKER_NUM

/**
 * `bindId` → 全局 workerId 的路由公式，与 alloy-core 的 `toGlobalTaskWorkerId` 同形。
 *
 * ⛔ 断言里不要把它硬编码成某个常量：`taskWorkerNum > 1` 时 `bindId % taskWorkerNum` 会真的产生
 * 分布，写成常量就等于把「取余路由」这件事从断言里删掉了（夹具退回单 task worker 时仍然全绿）。
 */
const taskWorkerFor = (bindId) => WORKER_NUM + (bindId % TASK_WORKER_NUM)

/** user task worker 槽位区间的起点；与 `firstUserTaskWorkerId` 同形。 */
const USER_TASK_BASE = WORKER_NUM + TASK_WORKER_NUM

/**
 * 被驱动的「用户任务」：`generated/protocol/server/S2S/actions.ts` 里注册的
 * `user/UserFieldValUpdate` —— 只有用户维度、不需要连接，且效果可直读（改 `User` 的 `name`）。
 * ⛔ 不要换成 `default/Default`：那是框架占位动作，跑通了也只能证明「管道通了」，
 * 证明不了 user task worker 上真的能跑业务 handler。
 */
const USER_TASK_API = 'user/UserFieldValUpdate'
/**
 * 候选 uid 的起点。刻意取一个远高于 `IdGenerater:user:<sid>` 的区间，避免和联调线路里
 * 真实分配过的内部 uid 撞上（撞上会让「这次写是我驱动的」不再显然）。
 */
const USER_TASK_UID_BASE = 77_000_000
/** 候选 uid 个数的上界：哈希正常时 3~4 个就覆盖全部槽位，这里只是「坏了也要跑得完」的兜底。 */
const USER_TASK_CANDIDATE_LIMIT = 24

const ROUTE_TRACE_PREFIX = '[alloy-process-route] '
/**
 * 等重拉的上限。首次崩溃的退避是 0（`#recordRestartFailure` 在 `consecutiveFailures === 1` 时直接返回 0），
 * 所以这段等待几乎全是「新进程 fork + 重新初始化」的时间；给足余量是因为它同时要覆盖
 * 「重拉后重新获取调度器所有权」那一段，超时太短会把真缺陷报成偶发。
 */
const RESTART_TIMEOUT_MS = 90000

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

/** 端口归属：返回正在 LISTEN 该端口的 pid 列表（去重、升序）。 */
function listenersOf(port) {
    let raw = ''
    try {
        raw = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
    } catch {
        // lsof 在「无监听者」时以非 0 退出，这本身就是合法结果。
        return []
    }
    return [
        ...new Set(
            raw
                .split('\n')
                .map((line) => Number(line.trim()))
                .filter(Boolean),
        ),
    ].sort((a, b) => a - b)
}

/** 解析日志里的跨进程路由痕迹。痕迹是结构化 JSON，断言不靠正则猜字段。 */
function routeTraces(log) {
    const traces = []
    for (const line of log.split('\n')) {
        const at = line.indexOf(ROUTE_TRACE_PREFIX)
        if (at < 0) continue
        try {
            traces.push(JSON.parse(line.slice(at + ROUTE_TRACE_PREFIX.length)))
        } catch {
            fail(`跨进程路由痕迹不是合法 JSON：${line}`)
        }
    }
    return traces
}

async function waitForPool(server, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    let last = '未开始'
    while (Date.now() < deadline) {
        if (server.child.exitCode !== null) {
            fail(`服务进程提前退出（code=${server.child.exitCode}），日志尾部：\n${server.tail.slice(-25).join('\n')}`)
        }
        try {
            const health = await getHealth(INTERNAL_PORT)
            if (health.status === 200 && health.body.ok) return health.body
            last = `health status=${health.status} body=${JSON.stringify(health.body)}`
        } catch (error) {
            last = (error && error.message) || String(error)
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    fail(
        `等待多进程进程池就绪超时（${timeoutMs}ms），最后状态：${last}\n日志尾部：\n${server.tail.slice(-25).join('\n')}`,
    )
}

async function waitGone(pids, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (pids.every((pid) => !isAlive(pid))) return true
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return pids.every((pid) => !isAlive(pid))
}

/**
 * 等某个槽位被**重新 fork**出来。
 *
 * 三个条件缺一不可，少一个就会把别的事误判成「重拉」：
 *   - `pid` 变了：只看它会把「槽位被标成 FAILED、pid 置空」也算进去；
 *   - `generation` 恰好 +1：只看它会被「spawn 到一半就失败」蒙混过去——`WorkerRegistry.beginSpawn`
 *     是在 fork **之前**就 +1 的，spawn 失败时 generation 已经涨了；
 *   - 新 pid 真实存活且状态为 READY/RUNNING：这是「补齐了」而不是「正在补」。
 */
async function waitForRestart(before, server, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    let last = '未开始'
    while (Date.now() < deadline) {
        if (server.child.exitCode !== null) {
            fail(`master 在等待 worker 重拉期间退出（code=${server.child.exitCode}）`)
        }
        try {
            const health = await getHealth(INTERNAL_PORT)
            const now = health.body.workers.filter((worker) => worker.workerId === before.workerId)[0]
            if (now === undefined) last = `槽位 ${before.workerId} 不在 /health 的 worker 列表里`
            else {
                last = JSON.stringify(now)
                if (
                    now.pid !== null &&
                    now.pid !== before.pid &&
                    now.generation === before.generation + 1 &&
                    (now.state === 'READY' || now.state === 'RUNNING') &&
                    isAlive(now.pid)
                ) {
                    return now
                }
            }
        } catch (error) {
            last = (error && error.message) || String(error)
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    fail(
        `等待 worker ${before.workerId} 重拉超时（${timeoutMs}ms），最后状态：${last}\n` +
            `日志尾部：\n${server.tail.slice(-25).join('\n')}`,
    )
}

async function main() {
    const readyTimeoutMs = Number(options['timeout-ms'] ?? 300000)
    const nativePort = Number(options['native-port'] ?? (await freePort()))

    const bundlePath = path.join(
        path.resolve(__dirname, '..', '..'),
        process.env.ALLOY_CORE_RUNTIME_BUNDLE ?? 'build/alloy-core/index.mjs',
    )
    if (!fs.existsSync(bundlePath)) {
        fail(
            `缺少 alloy-core 运行时 bundle：${bundlePath}\n` +
                '先跑 `pnpm build:runtime`（需要同级仓 alloy-core 的源码）；本机没有该源码时无法生成，' +
                '也就无法做真实多进程验证 —— 不要用单进程结果替代。',
        )
    }

    const h = createHarness({
        platform: PLATFORM,
        platformVersion: PLATFORM_VERSION,
        sid: SID,
        centerRedisDb: CENTER_REDIS_DB,
        userRedisDb: USER_REDIS_DB,
        clientPort: CLIENT_PORT,
        internalPort: INTERNAL_PORT,
        gmSecret: GM_SECRET,
        nativePort,
        launchMode: 'multi',
    })

    console.log(
        `原生 Lobby 真实进程自检（多进程）：platform=${h.PLATFORM} version=${h.PLATFORM_VERSION} ` +
            `sid=${h.SID} workers=${WORKER_NUM}+${TASK_WORKER_NUM}+${USER_TASK_WORKER_NUM} run=${h.RUN_ID}`,
    )

    await assertPortFree(h.NATIVE_PORT, '原生 Lobby')
    await assertPortFree(h.INTERNAL_PORT, '内网 HTTP')
    await assertPortFree(HEALTH_PORT, '主控健康探针')
    await assertPortFree(h.CLIENT_PORT, '旧客户端')
    if (h.NATIVE_PORT === h.CLIENT_PORT || h.NATIVE_PORT === h.INTERNAL_PORT) {
        fail(`原生端口 ${h.NATIVE_PORT} 不能与旧客户端端口 ${h.CLIENT_PORT} / 内网端口 ${h.INTERNAL_PORT} 相同`)
    }

    await h.platform.start()

    const server = h.startServer({
        PROJECT_ID: h.PROJECT_ID,
        NATIVE_LOBBY_HOST: '127.0.0.1',
        NATIVE_LOBBY_PORT: String(h.NATIVE_PORT),
        WEBPLATFORM_INTERNAL_ORIGIN: h.platform.origin,
        WEBPLATFORM_SERVICE_ID: 'game-live-check',
        WEBPLATFORM_SERVICE_SECRET: `live-secret-${h.RUN_ID}`,
        // ⛔ 本线路的全部价值都建立在这个开关上：`0` 会让整套多进程断言静默退化成单进程。
        ALLOY_MULTI_PROCESS_ENABLED: '1',
        // 跨进程路由/推送痕迹：没有它，「请求真的跨了进程」只能靠推断。
        ALLOY_PROCESS_ROUTE_TRACE: '1',
        CODEBUDDY_SAFE_DELETE_ENABLED: '0',
    })

    const clients = []
    let stopped = false

    try {
        console.log(`  启动服务进程… 日志：${h.logPath}`)
        const health = await waitForPool(server, readyTimeoutMs)
        const live = await getProbe(HEALTH_PORT, '/livez')
        const probeReady = await getProbe(HEALTH_PORT, '/readyz')
        equal(live.status, 200, '主控 liveness 必须可用')
        equal(probeReady.status, 200, '进程池就绪后 master readiness 必须可用')
        const ready = await h.waitUntilReady(readyTimeoutMs, server)
        ready.close()
        console.log(`  原生端点在 127.0.0.1:${h.NATIVE_PORT} 就绪`)

        // ---- 进程池拓扑：这是「真的多进程」的第一层证据，且与端口归属交叉核对
        await scenario('进程池：四种角色全部就绪，且恰好一个进程绑定原生端点', async () => {
            // 先给「本线路的拓扑本身有证明力」上一道闸。分布类断言只在 taskWorkerNum > 1 时才有内容：
            // 退回 1 时 `bindId % taskWorkerNum` 恒为 0，「按 bindId 路由」与「永远发给同一个 worker」
            // 在外部观测上完全一样，而「观察到的目标覆盖了全部 task worker」会退化成恒真。
            check(
                TASK_WORKER_NUM >= 2,
                '本线路的 taskWorkerNum 必须 ≥ 2：等于 1 会让 bindId 分布断言退化成空转（夹具与脚本常量要一起改）',
            )
            // 同理：userTaskWorkerNum=1 时「按 uid 哈希路由」与「永远发给同一个槽位」在外部观测上
            // 完全一样，用户任务那一条的分布断言会退化成恒真。
            check(
                USER_TASK_WORKER_NUM >= 2,
                '本线路的 userTaskWorkerNum 必须 ≥ 2：等于 1 会让用户任务的哈希分布断言退化成空转（夹具与脚本常量要一起改）',
            )
            equal(health.launchMode, 'multi', '启动模式')
            equal(
                health.workers.length,
                EXPECTED_WORKERS,
                '进程池规模必须等于配置的 workerNum + taskWorkerNum + userTaskWorkerNum',
            )

            const workers = health.workers.filter((worker) => worker.role === 'WORKER')
            const taskWorkers = health.workers.filter((worker) => worker.role === 'TASK_WORKER')
            const userTaskWorkers = health.workers.filter((worker) => worker.role === 'USER_TASK_WORKER')
            equal(workers.length, WORKER_NUM, 'WORKER 角色数')
            equal(taskWorkers.length, TASK_WORKER_NUM, 'TASK_WORKER 角色数')
            equal(userTaskWorkers.length, USER_TASK_WORKER_NUM, 'USER_TASK_WORKER 角色数')
            const listener = workers[0]
            check(listener !== undefined, '必须存在承担监听的 WORKER')
            // 角色判定（`workerRole`）按 workerId 分段：判错的表现是「没人绑定端点」或「两个进程抢同一个端口」。
            deepEqual(
                health.workers.map((worker) => worker.workerId).sort((a, b) => a - b),
                Array.from({ length: EXPECTED_WORKERS }, (_value, index) => index),
                'workerId 必须覆盖 0..池规模-1，不允许空洞',
            )
            equal(
                new Set(health.workers.map((worker) => worker.pid)).size,
                EXPECTED_WORKERS,
                '每个槽位必须是独立进程（pid 不得重复）',
            )

            const childPids = childPidsOf(server.child.pid)
            equal(childPids.length, EXPECTED_WORKERS, 'master 的子进程数必须等于进程池规模')

            // 端口归属是外部可观测的硬证据：`lobbyRoleOf` 判错的表现就是「没人绑定」或「多个进程抢同一个端口」。
            const nativeListeners = listenersOf(h.NATIVE_PORT)
            deepEqual(nativeListeners, [listener.pid], '原生端点必须**只**由 worker 0 绑定')
            const legacyListeners = listenersOf(h.CLIENT_PORT)
            deepEqual(legacyListeners, [server.child.pid], '旧客户端端口必须由 master 绑定')

            return (
                `master pid=${server.child.pid}；worker0 pid=${listener.pid}（原生端点）` +
                `；task worker pid=${taskWorkers.map((worker) => worker.pid).join(',')}` +
                `；user task worker pid=${userTaskWorkers[0].pid}`
            )
        })

        // ---- 旧二进制通道已删除：端口仍在听，但必须显式拒绝，不留「在听却静默丢帧」的中间态
        await scenario('旧二进制通道：客户端端口仍绑定，连接被 1008 显式关闭而不是静默丢帧', async () => {
            const socket = new WebSocket(`ws://127.0.0.1:${h.CLIENT_PORT}`)
            const closed = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('连接未被关闭')), 8000)
                socket.once('close', (code, reason) => {
                    clearTimeout(timer)
                    resolve({ code, reason: reason.toString() })
                })
                socket.once('error', () => undefined)
            })
            equal(closed.code, 1008, '旧通道连接必须被显式关闭')
            check(/Legacy channel removed/.test(closed.reason), `关闭原因应可诊断：${JSON.stringify(closed.reason)}`)
            return `close ${closed.code} reason=${JSON.stringify(closed.reason)}`
        })

        // ---- 与单进程线路**完全同一份**协议场景集
        await runLobbyProtocolScenarios(h, { clients, platform: h.platform })

        // ---- 跨进程证据：痕迹必须在跑完协议场景之后读，因为它正是那些场景产生的
        const log = h.readLog()
        const traces = routeTraces(log)

        await scenario('跨进程转发：guild.join 按 bindId 落到 task worker 执行，结果回传监听进程', async () => {
            const routed = traces.filter(
                (trace) =>
                    trace.event === 'route' && trace.kind === 'routed-lobby-route' && trace.route === 'guild.join',
            )
            check(
                routed.length > 0,
                `日志里没有 guild.join 的跨进程路由痕迹（痕迹总数 ${traces.length}）：` +
                    '请求要么根本没跨进程，要么路由决策没被执行',
            )
            for (const trace of routed) {
                equal(trace.sourceWorkerId, 0, 'guild.join 必须由监听进程发起转发')
                equal(
                    trace.targetWorkerId,
                    taskWorkerFor(trace.bindId),
                    `bindId=${trace.bindId} 必须落到 worker_num + bindId % taskWorkerNum`,
                )
            }
            // 协议场景集里 guild.join 只有两次**真正的执行**：幂等写的首写（guildId=4）与断线场景的
            // 飞行中写（guildId=2）。两次重放（同 clientReqId）都由**监听进程**的通用幂等闸短路，
            // 因此不该产生第三次转发。按 bindId 逐一对齐，而不是数一个「不少于」的下限：
            // 多出任何一条都说明闸没挡住重放，副作用会重复落库。
            deepEqual(
                routed.map((trace) => trace.bindId).sort((left, right) => left - right),
                [2, 4],
                'guild.join 的跨进程次数必须恰好等于两次真实执行（重放不得转发）',
            )
            return `2 次 guild.join：bindId 2/4 各一次，0 → ${routed.map((trace) => trace.targetWorkerId).join('/')}`
        })

        await scenario('跨进程推送：guild.event 由 task worker 转给监听进程后才写到 wire', async () => {
            const pushes = traces.filter((trace) => trace.event === 'push' && trace.kind === 'lobby-push')
            check(
                pushes.length > 0,
                `日志里没有 lobby-push 痕迹：领域推送要么没跨进程，要么根本没发生（痕迹总数 ${traces.length}）`,
            )
            const guildEvents = pushes.filter((trace) => trace.route === 'guild.event')
            check(
                guildEvents.length > 0,
                `必须有 guild.event 的跨进程推送，实际类型：${JSON.stringify(pushes.map((p) => p.route))}`,
            )
            // 源必须是**池里真实存在的某个 task worker**：写死一个具体 id 会在拓扑变化时变成假断言
            // （比如把 taskWorkerNum 调大后，推送源换成了别的槽位却依然「通过」）。
            const taskWorkerIds = health.workers
                .filter((worker) => worker.role === 'TASK_WORKER')
                .map((worker) => worker.workerId)
            for (const trace of guildEvents) {
                check(
                    taskWorkerIds.includes(trace.sourceWorkerId),
                    `推送必须由执行 handler 的 task worker 发起，实际 sourceWorkerId=${trace.sourceWorkerId}，` +
                        `池里的 task worker 是 ${JSON.stringify(taskWorkerIds)}`,
                )
                equal(trace.targetWorkerId, 0, '推送必须转给持有连接的监听进程')
            }
            const sources = [...new Set(guildEvents.map((trace) => trace.sourceWorkerId))].sort((a, b) => a - b)
            return `${guildEvents.length} 次 guild.event：${sources.join('/')} → 0`
        })

        /**
         * 运营入口的落点，是**只有真实多进程宿主才能证明**的那件事。
         *
         * alloy-core 的 worker 侧进程消息只接受「源角色是 worker」的信封（`WorkerProcessMessenger`
         * 的信任校验），主控发出去的 `PROCESS_MESSAGE` 会被判为 `INVALID_SOURCE` 丢弃、调用方只能
         * 等到超时。所以「需要落到某个 worker 执行」的内部动作都不能从主控发起：内部 HTTP 端点
         * 必须落在**监听进程**上。端口归属是外部可观测的硬证据——只看「请求最后成功了」区分不出
         * 「端点本来就在对的地方」和「端点走了一条恰好也能通的旁路」。
         */
        await scenario('运营入口：内部 HTTP 端点由监听进程承载，运营下线不经跨进程管道', async () => {
            const listener = health.workers.filter((worker) => worker.role === 'WORKER')[0]
            check(listener !== undefined, '必须存在承担监听的 WORKER')
            deepEqual(listenersOf(h.INTERNAL_PORT), [listener.pid], '内网 HTTP 端点必须**只**由监听 worker 绑定')
            deepEqual(listenersOf(HEALTH_PORT), [server.child.pid], '独立健康探针必须只由 master 承载')
            equal((await getProbe(HEALTH_PORT, '/livez')).status, 200, '主控 liveness 必须可读')
            equal((await getProbe(HEALTH_PORT, '/readyz')).status, 200, '完整进程池必须 ready')
            check(
                listenersOf(h.INTERNAL_PORT).includes(server.child.pid) === false,
                '主控进程不得绑定内网 HTTP 端点：它发不出到 worker 的进程请求',
            )
            // 非监听 worker（含 user task worker）只装载路由表并转发推送，⛔ 不得抢端点：
            // 它们也持有 `forward` 角色，`lobbyRoleOf` 判错就会变成「两个进程抢同一个端口」。
            for (const worker of health.workers.filter((candidate) => candidate.pid !== listener.pid)) {
                check(
                    listenersOf(h.INTERNAL_PORT).includes(worker.pid) === false,
                    `非监听进程不得绑定内网端点：${worker.role} pid=${worker.pid}`,
                )
                check(
                    listenersOf(h.NATIVE_PORT).includes(worker.pid) === false,
                    `非监听进程不得绑定原生端点：${worker.role} pid=${worker.pid}`,
                )
            }
            // 端点就在持有连接的进程里，运营下线必须就地执行。出现 kick 痕迹说明请求又绕去了别的进程。
            const kicks = traces.filter((trace) => trace.event === 'kick')
            deepEqual(kicks, [], '运营下线不得走跨进程管道')
            return `内网端点 pid=${listener.pid}（监听 worker）；其余 ${EXPECTED_WORKERS - WORKER_NUM} 个进程 0 端点；kick 痕迹 0 条`
        })

        /**
         * worker 崩溃重拉：只有真实多进程宿主才能证明「一个 worker 死了，服务不会跟着塌」。
         *
         * 判据全部取自 alloy-core 自己的共享状态（`/health` 的 `workerId → pid/generation`）：
         * `generation` 只在**重新 fork 同一个槽位**时 +1（`WorkerRegistry.beginSpawn`），所以
         * 「同一 workerId、pid 换了、generation 恰好 +1、新进程活着」就是重拉本身，不是脚本推算的。
         *
         * ⛔ 只杀一次。alloy-core 的重启预算是在 10s 窗口内最多 5 次，第 6 次判 crash loop 并
         * **停掉整个 runtime**；反复杀会把后面的场景一起带走，而那不是这条用例要证明的东西。
         *
         * 这里刻意杀 **task worker** 而不是监听进程：本夹具里 task worker 同时是 `schedulerOwner`
         * （`taskWorkerNum > 0` 时归 `worker_num` 那个槽位），所以这一次崩溃连带考验
         * 「重拉后调度器所有权能不能重新拿到」——那正是重启最容易卡住的地方。
         */
        await scenario('worker 崩溃重拉：杀掉 task worker 后自动补齐，监听进程与业务端点都不受影响', async () => {
            const before = await getHealth(h.INTERNAL_PORT)
            // 显式挑 `schedulerOwner` 那个槽位（`taskWorkerNum > 0` 时归 `worker_num`），
            // 而不是「task worker 列表的第一个」：换拓扑时前者才是这条用例想杀的那个进程。
            const beforeTask = before.body.workers.filter(
                (worker) => worker.role === 'TASK_WORKER' && worker.workerId === WORKER_NUM,
            )[0]
            const beforeListener = before.body.workers.filter((worker) => worker.role === 'WORKER')[0]
            check(beforeTask !== undefined, '进程池里必须有 task worker')
            check(beforeListener !== undefined, '进程池里必须有监听 worker')
            check(isAlive(beforeTask.pid), `task worker pid ${beforeTask.pid} 必须真实存活`)
            check(
                childPidsOf(server.child.pid).includes(beforeTask.pid),
                'task worker 必须是 master 的子进程，否则杀掉的不是进程池里的那个',
            )

            process.kill(beforeTask.pid, 'SIGKILL')

            const afterTask = await waitForRestart(beforeTask, server, RESTART_TIMEOUT_MS)
            check(afterTask.pid !== beforeListener.pid, 'task worker 不得与监听 worker 变成同一个进程')

            // 崩溃必须只带走它自己：master 与监听进程都不该被牵连。
            check(server.child.exitCode === null, 'master 不得随 worker 一起退出')
            const healed = await waitForPool(server, RESTART_TIMEOUT_MS)
            const afterListener = healed.workers.filter((worker) => worker.role === 'WORKER')[0]
            equal(afterListener.pid, beforeListener.pid, '监听进程不得被重拉（它没有崩）')
            equal(afterListener.generation, beforeListener.generation, '监听进程的 generation 不得变化')
            deepEqual(listenersOf(h.NATIVE_PORT), [beforeListener.pid], '重拉后原生端点仍必须由同一个监听进程绑定')
            deepEqual(listenersOf(h.INTERNAL_PORT), [beforeListener.pid], '重拉后内网端点仍必须由同一个监听进程绑定')
            check(
                childPidsOf(server.child.pid).includes(afterTask.pid),
                '重拉出来的 task worker 必须仍是 master 的子进程',
            )

            // 崩溃必须在我们的日志里留下可诊断的一行：worker 自己的 `onWorkerExit` 只在优雅 drain
            // 时才会跑，硬杀根本轮不到它，主控的 `onWorkerError` 是唯一能看到这件事的地方。
            const crashLine = h
                .readLog()
                .split('\n')
                .find((line) => line.includes('worker 意外退出') && line.includes(`workerId=${beforeTask.workerId}`))
            check(
                crashLine !== undefined,
                `崩溃必须留下可诊断的一行（workerId=${beforeTask.workerId}）：` +
                    '没有它，线上只能事后看到一个 pid 悄悄换了，连崩溃原因都查不到',
            )
            check(/signal=9/.test(crashLine), `SIGKILL 必须以 signal=9 记录，实际：${JSON.stringify(crashLine)}`)

            // 重拉出来的进程必须真的能干活，而不只是「/health 里有个 READY 记录」：
            // 用一次新的 guild.join 走完整的「监听进程 → 重拉后的 task worker → 推送回监听进程」。
            // guildId 要挑**路由到刚被重拉的那个槽位**的那个（固定集合 {1,2,3,4} 里选一个满足的），
            // 否则这次写会落到另一个没崩的 task worker 上，证明不了重拉出来的进程能用。
            const uid = `live-restart-${h.RUN_ID}`
            const guildId = [1, 2, 3, 4].find((candidate) => taskWorkerFor(candidate) === beforeTask.workerId)
            check(guildId !== undefined, `固定公会集合里必须有一个路由到 worker ${beforeTask.workerId} 的 guildId`)
            const tracesBefore = routeTraces(h.readLog()).length
            const client = await h.makeConnector(clients)(`tk-restart-${h.RUN_ID}`, uid)
            client.send(h.rpc('rs1', h.GuildRpc.Join, { clientReqId: `restart-${h.RUN_ID}`, guildId }))
            const [reply] = await client.collect(h.isReplyFor('rs1'), 1)
            check(reply.reply.ok === true, `重拉后的 task worker 必须能执行 guild.join：${JSON.stringify(reply)}`)
            const [pushed] = await client.collect(h.isPushOf('guild.event'), 1)
            equal(pushed.push.data.guildId, guildId, '推送里的 guildId')

            // 痕迹按「读日志的时刻」切片：日志是只追加的，所以新增的那几条就是这次 join 产生的。
            // 断言「恰好一条、且 bindId/source/target 全对」而不是「至少一条」：多出来就说明
            // 重拉后出现了重复转发或第二个执行者，那正是崩溃重拉最可能引入的回归。
            const fresh = routeTraces(h.readLog()).slice(tracesBefore)
            const routed = fresh.filter(
                (trace) =>
                    trace.event === 'route' && trace.kind === 'routed-lobby-route' && trace.route === 'guild.join',
            )
            deepEqual(
                routed.map((trace) => [trace.bindId, trace.sourceWorkerId, trace.targetWorkerId]),
                [[guildId, 0, beforeTask.workerId]],
                '重拉后这次 guild.join 必须**恰好**跨进程一次，且落到重拉出来的那个槽位',
            )
            const pushes = fresh.filter((trace) => trace.event === 'push' && trace.kind === 'lobby-push')
            check(pushes.length > 0, '重拉后的领域推送必须仍能跨进程回到监听进程')
            for (const trace of pushes) {
                equal(trace.sourceWorkerId, beforeTask.workerId, '推送必须由重拉后的 task worker 发起')
                equal(trace.targetWorkerId, 0, '推送必须转给持有连接的监听进程')
            }

            return (
                `worker ${beforeTask.workerId} pid ${beforeTask.pid}→${afterTask.pid}` +
                `，generation ${beforeTask.generation}→${afterTask.generation}` +
                `；监听进程 pid=${beforeListener.pid} 未动、业务端点未迁移，重拉后跨进程链路仍通`
            )
        })

        /**
         * `bindId % taskWorkerNum` 的**分布**，只有 `taskWorkerNum > 1` 才能证明。
         *
         * `taskWorkerNum === 1` 时取余恒为 0，「按 bindId 路由」与「永远发给同一个 worker」在外部
         * 观测上完全一样 —— 也就是说单 task worker 的夹具会让这条路由退化成常量而断言仍然全绿。
         * 所以这里同时依赖两件事：夹具的 `taskWorkerNum: 2`，以及断言**不把目标写死**。
         *
         * 固定公会集合是 {1,2,3,4}（`GuildNativeLobbyStore`），四个 id 对 2 取余覆盖 0/1 两档：
         * 协议场景集用掉 2/4（余 0 → worker 1），本场景再驱动 1/3（余 1 → worker 2），
         * 于是「两个 task worker 都真的执行过写」这件事被观察到，而不是推断出来。
         */
        await scenario(
            'bindId 分布：不同 guildId 按 bindId % taskWorkerNum 落到不同 task worker，不是常量落点',
            async () => {
                const uid = `live-spread-${h.RUN_ID}`
                const client = await h.makeConnector(clients)(`tk-spread-${h.RUN_ID}`, uid)
                const driven = [1, 3]
                for (const [index, guildId] of driven.entries()) {
                    client.send(
                        h.rpc(`sp${index}`, h.GuildRpc.Join, { clientReqId: `spread-${guildId}-${h.RUN_ID}`, guildId }),
                    )
                    const [reply] = await client.collect(h.isReplyFor(`sp${index}`), 1)
                    check(reply.reply.ok === true, `guild.join ${guildId} 应成功：${JSON.stringify(reply)}`)
                    await client.collect(h.isPushOf('guild.event'), 1)
                }

                const routed = routeTraces(h.readLog()).filter(
                    (trace) =>
                        trace.event === 'route' && trace.kind === 'routed-lobby-route' && trace.route === 'guild.join',
                )
                // 协议场景集的两次（bindId 2/4）必须都还在：本场景是在它们的观测之上追加，不是替换。
                const bindIds = [...new Set(routed.map((trace) => trace.bindId))].sort((a, b) => a - b)
                deepEqual(bindIds, [1, 2, 3, 4], `四个固定公会都应被观察到跨进程路由，实际 ${JSON.stringify(bindIds)}`)
                for (const trace of routed) {
                    equal(trace.sourceWorkerId, 0, `bindId=${trace.bindId} 必须由监听进程发起转发`)
                    equal(
                        trace.targetWorkerId,
                        taskWorkerFor(trace.bindId),
                        `bindId=${trace.bindId} 的目标必须等于 worker_num + bindId % taskWorkerNum`,
                    )
                }
                const targets = [...new Set(routed.map((trace) => trace.targetWorkerId))].sort((a, b) => a - b)
                const taskWorkerIds = health.workers
                    .filter((worker) => worker.role === 'TASK_WORKER')
                    .map((worker) => worker.workerId)
                    .sort((a, b) => a - b)
                deepEqual(
                    targets,
                    taskWorkerIds,
                    '观察到的目标必须覆盖**全部** task worker —— 只落在一个上说明路由是常量而不是取余，' +
                        '（多半是夹具的 taskWorkerNum 被退回了 1）',
                )
                const pairs = [...new Set(routed.map((trace) => `${trace.bindId}→${trace.targetWorkerId}`))].sort()
                return `bindId → target：${pairs.join(' / ')}（覆盖 ${targets.length} 个 task worker）`
            },
        )

        /**
         * 用户任务真的落到 user task worker 上执行 —— 这是 `USER_TASK_WORKER` 角色的存在理由。
         *
         * 在此之前该角色只被证到「能就位、健康、不绑任何端点、不抢调度器」：本仓没有用户任务的
         * 生产者，没有真实负载可驱动。现在有了：`/internal/action` 的 `localAction`（跨服即时派发
         * 与运营入口共用的那一跳）按 uid 哈希落到 user task worker，执行一次真实的用户维度写。
         *
         * 判据刻意分两层，缺一不可：
         *   - `event: 'route'`：源进程（监听进程）在 `requestMessage` **之前**打出，只证明
         *     「发起了转发、目标是哈希算出来的槽位」；
         *   - `event: 'exec'`：目标进程在执行的那一刻**自己**打出、带上自己的 pid，才证明
         *     「真的在它上面执行了」，并与 `/health` 的 `workerId → pid` 交叉核对。
         * 只有第一条时，「转发被丢弃、调用方超时」也会看起来像通过。
         *
         * 与 `bindId` 分布同理：`userTaskWorkerNum === 1` 时哈希退化成常量，「覆盖全部 user task
         * worker」会退化成恒真，所以夹具与脚本常量都要求 ≥ 2。
         */
        await scenario('用户任务：按 uid 哈希落到 user task worker 执行（目标进程自证 + pid 交叉核对）', async () => {
            const userTaskIds = health.workers
                .filter((worker) => worker.role === 'USER_TASK_WORKER')
                .map((worker) => worker.workerId)
                .sort((a, b) => a - b)
            deepEqual(
                userTaskIds,
                Array.from({ length: USER_TASK_WORKER_NUM }, (_value, index) => USER_TASK_BASE + index),
                'user task worker 必须是池尾连续的一段槽位（`worker_num + task_worker_num` 起）',
            )
            const pidOf = new Map(health.workers.map((worker) => [worker.workerId, worker.pid]))
            const listener = health.workers.filter((worker) => worker.role === 'WORKER')[0]
            check(listener !== undefined, '必须存在承担监听的 WORKER')

            // 候选 uid 逐个驱动。上限 24 是「哈希坏了也要跑得完并给出结论」的上界，
            // 不是期望值：哈希正常时两个槽位在 3~4 个候选内就会被覆盖。
            const driven = []
            for (let index = 0; index < USER_TASK_CANDIDATE_LIMIT; index += 1) {
                const uid = USER_TASK_UID_BASE + index
                // 夹具：按**引擎自己的** `Hash` 存储契约准备一份 `User`（键 `User_<id>`，落 user Redis）。
                // ⛔ 这不是「生产已有这条链路」，它准备的是被驱动的那次用户写的输入。
                h.userRedis('hset', `User_${uid}`, 'id', String(uid), 'sId', String(h.SID), 'name', `seed-${uid}`)
                const name = `utask-${h.RUN_ID}-${index}`
                const response = await h.postInternalAction({
                    type: 'localAction',
                    actionParams: {
                        apiName: USER_TASK_API,
                        uId: uid,
                        sId: h.SID,
                        req: { uId: uid, data: [{ field: 'name', val: name }] },
                    },
                })
                equal(response.status, 200, '内部动作入口 HTTP 状态')
                equal(response.body.code, 0, `用户任务必须执行成功（uid=${uid}）：${JSON.stringify(response.body)}`)
                driven.push({ uid, name })
            }

            // 痕迹是服务进程异步写到日志里的；等它写满，但**不**放宽任何断言。
            const deadline = Date.now() + 5000
            let routes = []
            for (;;) {
                routes = routeTraces(h.readLog()).filter(
                    (trace) => trace.kind === 'user-task' && trace.event === 'route',
                )
                if (routes.length >= driven.length || Date.now() > deadline) break
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
            equal(routes.length, driven.length, `每次用户任务都必须留下恰好一条转发痕迹`)

            const targetOf = new Map()
            for (const trace of routes) {
                equal(trace.sourceWorkerId, 0, `用户任务必须由监听进程发起转发（uid=${trace.uid}）`)
                check(
                    userTaskIds.includes(trace.targetWorkerId),
                    `用户任务的目标必须是 user task worker，实际 ${trace.targetWorkerId}，` +
                        `池里的 user task worker 是 ${JSON.stringify(userTaskIds)}`,
                )
                targetOf.set(trace.uid, trace.targetWorkerId)
            }

            // 落点必须覆盖**全部** user task worker：只落在一个上说明路由是常量而不是哈希
            // （多半是夹具的 userTaskWorkerNum 被退回了 1，或者哈希被换成了固定值）。
            const targets = [...new Set(targetOf.values())].sort((a, b) => a - b)
            deepEqual(
                targets,
                userTaskIds,
                '观察到的落点必须覆盖**全部** user task worker —— 只落在一个上说明路由是常量而不是按 uid 哈希',
            )

            // 同一 uid 重复驱动必须落到同一个槽位：哈希是确定性函数，落点抖动说明「按 uid 路由」
            // 这件事根本没发生（比如退回了「第一个就绪的 worker」）。
            const repeatUid = driven[0].uid
            const repeatName = `utask-again-${h.RUN_ID}`
            const repeat = await h.postInternalAction({
                type: 'localAction',
                actionParams: {
                    apiName: USER_TASK_API,
                    uId: repeatUid,
                    sId: h.SID,
                    req: { uId: repeatUid, data: [{ field: 'name', val: repeatName }] },
                },
            })
            equal(repeat.body.code, 0, `重复驱动的用户任务必须成功：${JSON.stringify(repeat.body)}`)
            const repeatRoutes = routeTraces(h.readLog()).filter(
                (trace) => trace.kind === 'user-task' && trace.event === 'route' && trace.uid === repeatUid,
            )
            check(repeatRoutes.length >= 2, `同一 uid 的两次驱动都应留下痕迹：${repeatRoutes.length}`)
            const repeatTargets = [...new Set(repeatRoutes.map((trace) => trace.targetWorkerId))]
            deepEqual(repeatTargets, [targetOf.get(repeatUid)], `同一 uid 必须恒定落到同一个 user task worker`)
            // 后面验证的是最终存储状态；同一 uid 的第二次真实写应覆盖第一次数值。
            driven[0].name = repeatName

            // 「真的执行了」只能由目标进程自己证明：`exec` 痕迹带的是**执行者自己的 pid**，
            // 与 `/health` 给出的槽位归属交叉核对，并且绝不能是监听进程。
            const execs = routeTraces(h.readLog()).filter(
                (trace) => trace.kind === 'user-task' && trace.event === 'exec',
            )
            equal(execs.length, driven.length + 1, '每次用户任务都必须留下恰好一条执行痕迹')
            for (const trace of execs) {
                const expectedPid = pidOf.get(targetOf.get(trace.uid))
                equal(
                    trace.pid,
                    expectedPid,
                    `uid=${trace.uid} 的执行者必须是哈希算出的那个槽位（pid ${trace.pid} ≠ ${expectedPid}）`,
                )
                check(trace.pid !== listener.pid, `用户任务不得在监听进程里就地执行（pid=${trace.pid}）`)
            }

            // 业务效果：那次用户维度的写真的落到了存储上。这条把「跨进程执行」与「副作用真的发生」
            // 绑在一起 —— 转发到目标进程但 handler 没跑完，这里就会是 seed 值。
            for (const { uid, name } of driven) {
                equal(
                    h.userRedis('hget', `User_${uid}`, 'name'),
                    name,
                    `uid=${uid} 的用户维度写必须真的落到 user Redis（键 User_${uid} 的 name 字段）`,
                )
            }

            const distribution = [...targetOf.entries()]
                .map(([uid, workerId]) => `${uid}→${workerId}`)
                .slice(0, 6)
                .join(' / ')
            return (
                `${driven.length} 次用户任务，落点覆盖 ${targets.join('/')}（${distribution} …）；` +
                `执行者 pid 与 /health 一致，监听进程 pid=${listener.pid} 未执行任何一条`
            )
        })

        await scenario('监听 worker 重拉：业务内网端点短暂不可用，但 master 存活探针持续可读', async () => {
            const before = await getHealth(h.INTERNAL_PORT)
            const listener = before.body.workers.find((worker) => worker.role === 'WORKER')
            check(listener !== undefined && listener.pid !== null, '必须找到监听 worker')
            process.kill(listener.pid, 'SIGKILL')

            let sawNotReady = false
            const deadline = Date.now() + RESTART_TIMEOUT_MS
            let after
            while (Date.now() < deadline) {
                const live = await getProbe(HEALTH_PORT, '/livez')
                equal(live.status, 200, '监听 worker 重拉期间 master /livez 必须持续可读')
                const ready = await getProbe(HEALTH_PORT, '/readyz')
                if (ready.status === 503) sawNotReady = true
                try {
                    const health = await getHealth(h.INTERNAL_PORT)
                    const candidate = health.body.workers.find((worker) => worker.workerId === listener.workerId)
                    if (
                        candidate &&
                        candidate.pid !== null &&
                        candidate.pid !== listener.pid &&
                        candidate.generation === listener.generation + 1 &&
                        (candidate.state === 'READY' || candidate.state === 'RUNNING')
                    ) {
                        after = candidate
                        break
                    }
                } catch {
                    // 监听 worker 已死而新 worker 尚未绑定内部端点，正是本场景要覆盖的窗口。
                }
                await new Promise((resolve) => setTimeout(resolve, 20))
            }
            check(after !== undefined, '监听 worker 必须在重启预算内补齐并重新绑定内部端点')
            check(sawNotReady, '监听 worker 缺席期间 /readyz 必须至少一次返回 503')
            equal((await getProbe(HEALTH_PORT, '/readyz')).status, 200, '监听 worker 重拉完成后 /readyz 必须恢复 200')
            deepEqual(listenersOf(HEALTH_PORT), [server.child.pid], '监听 worker 重拉不得迁移主控探针端口')
            deepEqual(listenersOf(h.INTERNAL_PORT), [after.pid], '重拉后的监听 worker 必须重新承载内部动作端点')
            deepEqual(listenersOf(h.NATIVE_PORT), [after.pid], '重拉后的监听 worker 必须重新承载原生 Lobby 端点')
            return `监听 worker ${listener.pid}→${after.pid}，generation ${listener.generation}→${after.generation}；/livez 持续 200，/readyz 恢复 200`
        })

        // ---- 优雅退出：drain 后 master 与全部 worker 都必须消失，不能留孤儿
        await scenario('优雅退出：SIGTERM 后 master 与全部 worker 退出且端口释放', async () => {
            const childPids = childPidsOf(server.child.pid)
            const exited = new Promise((resolve) => server.child.once('exit', () => resolve(true)))
            server.child.kill('SIGTERM')
            const graceful = await Promise.race([
                exited,
                new Promise((resolve) => setTimeout(() => resolve(false), 20000)),
            ])
            // 只有真的退出了才标记「已停」：无条件标记会让 finally 以为不需要收尾，
            // 于是一个没退出的服务进程会变成孤儿并一直占着端口（下一次运行直接 EADDRINUSE）。
            stopped = graceful
            if (!graceful) server.child.kill('SIGKILL')
            check(graceful, 'master 未在 20s 内优雅退出')
            const gone = await waitGone(childPids, 10000)
            check(gone, `仍有孤儿 worker 进程：${childPids.filter(isAlive).join(', ')}`)
            deepEqual(listenersOf(h.NATIVE_PORT), [], '退出后原生端点必须释放')
            deepEqual(listenersOf(h.CLIENT_PORT), [], '退出后旧客户端端口必须释放')
            deepEqual(listenersOf(h.INTERNAL_PORT), [], '退出后内网 HTTP 端点必须释放')
            deepEqual(listenersOf(HEALTH_PORT), [], '退出后主控健康探针端口必须释放')
            return `${childPids.length} 个 worker 与 master 全部退出，四个端口均已释放`
        })
    } finally {
        for (const client of clients) client.close()
        if (!stopped) {
            const exited = new Promise((resolve) => server.child.once('exit', () => resolve(true)))
            server.child.kill('SIGTERM')
            const graceful = await Promise.race([
                exited,
                new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
            ])
            if (!graceful) server.child.kill('SIGKILL')
        }
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
    console.log(`关键键：nativeLobby:identity:v1 / nativeLobby:guild:* / IdGenerater:user:${h.SID}`)
    process.exit(failed.length ? 1 : 0)
}

resetResults()
main().catch((error) => {
    console.error(`自检失败：${(error && error.stack) || error}`)
    process.exit(1)
})
