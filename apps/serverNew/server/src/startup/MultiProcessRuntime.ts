import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { EngineInitHelper, RouteAction, UserOnlineMgr } from '@arthropoda/game-engine'
import { initializeApplication } from './initializeApplication'
import {
    initializeServiceRuntime,
    nativeLobbyRuntime,
    prepareServiceRuntimeShutdown,
    shutdownServiceRuntime,
} from './ServiceRuntime'
import { isForceLogoutReason } from './NativeLobbyRuntime'
// 角色判定单独成模块（`lobbyRole.ts`）：它是「禁止静默降级单进程」的唯一判定点，必须有直接测试。
import { lobbyRoleOf, schedulerOwner, workerRole } from './lobbyRole'
// 玩家 Owner / 非玩家 Task 的跨进程转发统一装在这里，并直接验证完整监听进程链路。
import { installNativeLobbyProcessRouter } from './installNativeLobbyProcessRouter'
import { routeOpsForceLogout } from '../runtime/lobby/NativeLobbyForceLogout'
import { nativeLobbyProcessRoutes } from '../runtime/lobby/NativeLobbyProcessRoutes'
import { InternalHttpServer } from '../runtime/http/InternalHttpServer'
import { RuntimeProbeServer } from '../runtime/http/RuntimeProbeServer'
import { executeInternalAction } from '../runtime/action/executeInternalAction'
import { handleProcessPipeRequest, isProcessPipeRequest, type ProcessPipeDependencies } from './processPipe'
import { resolvePlayerWorker } from './resolvePlayerWorker'
import type { RuntimeCallbacksLike, RuntimeServerConstructor, RuntimeServerLike } from './runtimeTypes'

/** alloy-core 共享统计里留给「每个 worker 的用户数」的起始槽位。 */
const USER_COUNT_BASE = 8
const PIPE_TIMEOUT_MS = 10_000

async function loadRuntimeServer(): Promise<RuntimeServerConstructor> {
    const bundlePath = process.env.ALLOY_CORE_RUNTIME_BUNDLE ?? path.resolve(__dirname, 'runtime', 'index.mjs')
    try {
        const module = (await import(/* webpackIgnore: true */ pathToFileURL(bundlePath).href)) as {
            RuntimeServer: RuntimeServerConstructor
        }
        return module.RuntimeServer
    } catch (error) {
        throw new Error(`加载 alloy-core ESM bundle 失败: ${bundlePath}`, { cause: error })
    }
}

/**
 * 装配一个 worker，并返回它是否**承担原生 Lobby 监听**。
 *
 * 返回值不是「顺手给调用方看」：内部 HTTP 端点必须由监听进程承载（见 `runMultiProcessRuntime`
 * 里 `onWorkerStart` 的说明），所以「谁是监听进程」这个判定不能在这里被丢掉、再由调用方重算一遍。
 */
async function initializeWorker(runtime: RuntimeServerLike): Promise<boolean> {
    const role = workerRole(runtime)
    EngineInitHelper.initProcessInfo({
        workerId: runtime.worker_id,
        role,
        workerNum: runtime.setting.worker_num,
        taskWorkerNum: runtime.setting.task_worker_num,
        userTaskWorkerNum: runtime.setting.user_task_worker_num ?? 0,
    })
    await initializeApplication({ appType: APP_TYPE, launchConfigurationLoaded: true })
    const nativeLobby = lobbyRoleOf(runtime, role, { pipeTimeoutMs: PIPE_TIMEOUT_MS })
    await initializeServiceRuntime({
        directNetwork: false,
        runSchedulers: schedulerOwner(runtime),
        nativeLobby,
    })

    // ⛔ 这里曾经装配 `MessageHelper.setProcessMessageTransport`：它用 `ClientConnection.encodePushMessage`
    // 编码旧二进制推送帧再写 socket。推送出口现在只有原生 Lobby（`nativeLobbyRuntime().push` 或
    // 转发给监听进程），因此不存在「本进程直接编码旧帧」的第二条路径。
    installNativeLobbyProcessRouter(runtime, PIPE_TIMEOUT_MS)
    return nativeLobby?.role === 'listen'
}

function pipeDependencies(): ProcessPipeDependencies {
    return {
        executeLobbyRoute: (route, identity, payload) => nativeLobbyProcessRoutes.execute(route, identity, payload),
        executeInternalAction: (payload, remoteAddress) => executeInternalAction(payload, remoteAddress),
        lookupUserConnection: async (uid, sid) => (await UserOnlineMgr.get(uid, sid))?.connectionId ?? null,
        pushLobbyConnection: async (uid, sid, type, data) => nativeLobbyRuntime()?.push(uid, sid, type, data) ?? false,
        syncLobbyConnection: async (internalUid, sid, data) =>
            nativeLobbyRuntime()?.syncByInternalUid(internalUid, sid, data) ?? false,
        kickLobbyConnection: (uid, sid, reason) =>
            isForceLogoutReason(reason) ? (nativeLobbyRuntime()?.kick(uid, sid, reason) ?? false) : false,
    }
}

async function handlePipeRequest(_runtime: RuntimeServerLike, message: unknown) {
    if (!isProcessPipeRequest(message)) throw new Error('unknown process request')
    return handleProcessPipeRequest(pipeDependencies(), message)
}

/**
 * 内部 HTTP 动作的落点。
 *
 * 带 uid 的内部动作走持久玩家 Owner；这里只处理没有 uid 的系统动作。
 * `USER_COUNT_BASE` 槽位目前没人维护，因此相同计数下稳定选择第一个就绪 Event Worker。
 */
function pickLeastLoadedWorker(runtime: RuntimeServerLike) {
    const stats = runtime.snapshotStats()
    const running = runtime
        .workers()
        .filter((worker) => worker.role === 'WORKER' && (worker.state === 'READY' || worker.state === 'RUNNING'))
    if (running.length === 0) throw new Error('没有可用的 Event Worker')
    return running.reduce((selected, candidate) =>
        (stats[USER_COUNT_BASE + candidate.workerId] ?? 0) < (stats[USER_COUNT_BASE + selected.workerId] ?? 0)
            ? candidate
            : selected,
    ).workerId
}

async function routeInternalAction(runtime: RuntimeServerLike, payload: any, remoteAddress?: string) {
    // 运营强制下线（4903）必须落到**持有连接的监听进程**：只有它能在 wire 上写 `forceLogout`
    // 与关闭码。本函数跑在监听进程里（端点由它承载），所以 `routeOpsForceLogout` 会就地执行；
    // 它保留「不在监听进程时改写成管道请求」的分支，是为了让这条判定只有一处。
    const forcedLogout = await routeOpsForceLogout(runtime, payload, PIPE_TIMEOUT_MS)
    if (forcedLogout) return forcedLogout

    const uid = Number(payload?.actionParams?.uId ?? payload?.uId) || 0
    const deps = pipeDependencies()
    const targetWorkerId = uid > 0 ? await resolvePlayerWorker(runtime, uid, SERVER_ID) : pickLeastLoadedWorker(runtime)
    // 目标就是本进程时直接执行：给自己发管道请求只是多一轮序列化，并把失败面扩大一圈。
    if (targetWorkerId === runtime.worker_id) return deps.executeInternalAction(payload, remoteAddress)
    return runtime.requestMessage({ kind: 'internal-action', payload, remoteAddress }, targetWorkerId, PIPE_TIMEOUT_MS)
}

export async function runMultiProcessRuntime(entrypoint: string) {
    if (process.env.TS_SWOOLE_RUNTIME_CHILD === '1') {
        // 终端 Ctrl-C 会广播给整个前台进程组；worker 必须等待 master 的 drain 控制，不能抢先退出。
        process.on('SIGINT', () => undefined)
    }
    const RuntimeServer = await loadRuntimeServer()
    let internalServer: InternalHttpServer | undefined
    let probeServer: RuntimeProbeServer | undefined
    let workerStopped = false
    const stopWorker = async () => {
        if (workerStopped) return
        workerStopped = true
        RouteAction.processRouter = undefined
        await internalServer?.stop()
        internalServer = undefined
        await shutdownServiceRuntime()
    }
    const callbacks: RuntimeCallbacksLike = {
        onStart: async (runtime) => {
            EngineInitHelper.initProcessInfo({
                workerId: null,
                role: 'MASTER',
                workerNum: runtime.setting.worker_num,
                taskWorkerNum: runtime.setting.task_worker_num,
                userTaskWorkerNum: runtime.setting.user_task_worker_num ?? 0,
            })
            console.log(
                `fixed sid ${SERVER_ID} launchMode=multi workerNum=${runtime.setting.worker_num} ` +
                    `taskWorkerNum=${runtime.setting.task_worker_num} ` +
                    `userTaskWorkerNum=${runtime.setting.user_task_worker_num ?? 0} ` +
                    `internal=${CP.service.internalHost}:${CP.service.internalPort} ` +
                    `probe=${CP.service.internalHost}:${CP.service.healthPort}`,
            )
            // 探针刻意由 master 承载：监听 worker 崩溃并重拉时，它仍可报告「主控活着、服务未就绪」。
            probeServer = new RuntimeProbeServer({
                host: CP.service.internalHost,
                port: CP.service.healthPort,
                live: () => ({ status: 200, body: { ok: true, launchMode: 'multi', pid: process.pid } }),
                ready: () => {
                    const workers = runtime.workers()
                    const expected =
                        runtime.setting.worker_num +
                        runtime.setting.task_worker_num +
                        (runtime.setting.user_task_worker_num ?? 0)
                    const healthy =
                        workers.length === expected &&
                        workers.every((worker) => worker.state === 'READY' || worker.state === 'RUNNING')
                    return {
                        status: healthy ? 200 : 503,
                        body: { ok: healthy, launchMode: 'multi', workers },
                    }
                },
            })
            await probeServer.start()
        },
        onShutdown: async () => {
            await probeServer?.stop()
            probeServer = undefined
        },
        /**
         * 内部 HTTP 端点由**承担原生 Lobby 监听的 worker** 承载，而不是主控进程。
         *
         * alloy-core 的 worker 侧进程消息只接受「源角色是 worker」的信封（`WorkerProcessMessenger`
         * 的信任校验），主控的 `MasterRuntimeServerFacade.requestMessage` 虽然会发出 `PROCESS_MESSAGE`，
         * 但会被目标 worker 判为 `INVALID_SOURCE` 丢弃 —— 调用方只能等到超时。因此任何「需要落到
         * 某个 worker 执行」的内部动作（运营下线、在线归属查询、LocalAction）都不能从主控发起。
         *
         * 监听进程同时具备两件事：业务运行时（`nativeLobbyRuntime()` 在这里非空，运营下线可就地执行）
         * 与访问其它 worker 的能力（`worker → worker` 的进程请求是被允许的）。`/health` 需要的
         * worker 列表与统计来自共享状态，监听进程读得到，所以端点整体搬过来不需要第二处端口。
         *
         * ⛔ 不要为了「主控看起来更中心」把它搬回去：那会让运营下线退化成「请求发不出去、10s 后超时」。
         */
        onWorkerStart: async (runtime) => {
            const listener = await initializeWorker(runtime)
            if (!listener) return
            internalServer = new InternalHttpServer({
                host: CP.service.internalHost,
                port: CP.service.internalPort,
                secret: CP.platform.gmSecret ?? '',
                health: () => {
                    const workers = runtime.workers()
                    const healthy =
                        workers.length ===
                            runtime.setting.worker_num +
                                runtime.setting.task_worker_num +
                                (runtime.setting.user_task_worker_num ?? 0) &&
                        workers.every((worker) => worker.state === 'READY' || worker.state === 'RUNNING')
                    return {
                        status: healthy ? 200 : 503,
                        body: { ok: healthy, launchMode: 'multi', workers },
                    }
                },
                action: (payload, remoteAddress) => routeInternalAction(runtime, payload, remoteAddress),
            })
            await internalServer.start()
        },
        onWorkerExit: prepareServiceRuntimeShutdown,
        onWorkerStop: stopWorker,
        /**
         * worker 意外退出（崩溃 / 被 OOM kill / 被 SIGKILL）时，主控是**唯一**能看到这件事的地方：
         * worker 自己的 `onWorkerExit` 只在优雅 drain 时才会跑，硬杀根本轮不到它执行。
         *
         * 不加这一条，「worker 崩了又被重拉」在服务日志里是完全无声的——alloy-core 内部的
         * `context.log` 不会落到服务进程的 stdout，线上只能事后看到一个 pid 悄悄换了，
         * 而 crash loop（10s 窗口内超过重启预算）会直接停掉整个 runtime，连停机原因都查不到。
         */
        onWorkerError: (_runtime, workerId, workerPid, exitCode, signal) => {
            console.error(
                `worker 意外退出：workerId=${workerId} pid=${workerPid} exitCode=${exitCode} signal=${signal}` +
                    '；alloy-core 会按重启预算自动补齐该槽位',
            )
        },
        /**
         * 旧二进制客户端通道已随 P6 删除。alloy-core 仍会绑定 `CP.service.clientPort`
         * （它的监听开关不在本仓库），但本进程不再解析任何客户端帧：连接一建立就显式关闭，
         * ⛔ 不要留下「端口在听、帧被静默丢弃」这种最难排查的中间态。
         */
        onOpen: (runtime, request) => {
            console.warn(`旧二进制客户端通道已删除，拒绝连接 fd=${request.fd}；请改用原生 Lobby 端点`)
            runtime.close(request.fd, 1008, 'Legacy channel removed')
        },
        onPipeRequest: (runtime, _sourceWorkerId, message) => handlePipeRequest(runtime, message),
    }
    const runtime = new RuntimeServer({
        settings: {
            host: CP.service.clientHost,
            port: CP.service.clientPort,
            protocol: 'websocket',
            work_mode: 'process',
            sock_type: 'tcp',
            worker_num: CP.service.workerNum,
            dispatch_mode: 2,
            task_worker_num: CP.service.taskWorkerNum,
            user_task_worker_num: CP.service.userTaskWorkerNum,
            buffer_input_size: CP.service.maxPacketSize,
        },
        callbacks,
        entrypoint,
        readyTimeoutMs: process.env.ALLOY_DEV_BOOTSTRAP ? 60_000 : 15_000,
        gracefulShutdownTimeoutMs: 10_000,
        terminateTimeoutMs: 3_000,
    })

    let stopping = false
    const stop = (signal: string) => {
        if (stopping) return
        stopping = true
        runtime.dispose(new Error(`received ${signal}`)).catch((error) => console.dir(error, { depth: 12 }))
    }
    if (process.env.TS_SWOOLE_RUNTIME_CHILD !== '1') {
        process.on('SIGINT', () => stop('SIGINT'))
        process.on('SIGTERM', () => stop('SIGTERM'))
    }
    await runtime.start()
    await runtime.stopped
}
