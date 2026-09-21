'use strict'

/**
 * 原生 Lobby「真实进程」自检的共享骨架。
 *
 * 抽出来的唯一理由是**单进程与多进程必须跑同一份用例代码**：如果两条线路各写一份断言，
 * 「单/多进程行为一致」就退化成「两份脚本各自说自己绿」，那不是证据。本模块只提供
 * 「怎么连、怎么收帧、怎么读真实 Redis、怎么起进程」，不含任何业务断言。
 *
 * 约定：所有夹具相关的常量（端口、库号、gmSecret、sid）都经 `createHarness(fixture)` 注入，
 * 模块级不留第二份真源。断言函数是纯函数，抛出的 Error 由 `scenario` 收集。
 */

const { spawn, execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { WebSocket } = require('ws')

const SERVER_ROOT = path.resolve(__dirname, '..', '..')

/**
 * GameRoom 侧私房存储契约的真源：`apps/server/src/core/rooms/invite/redisScripts.ts`。
 *
 * 这里**逐字提取**它的 Lua 正文并交给真实 Redis 执行——不是照抄一份「等价实现」。
 * 要证明的命题是「serverNew 写下的东西能被 GameRoom 的**同一条**原子段消费」，自己再写一份
 * 就等于自己证明自己。提取失败必须响亮地失败：源码改了形状而这里静默跳过，等于把接缝证据
 * 变成空跑（看起来绿，其实什么都没验）。
 */
const GAME_ROOM_SCRIPTS_PATH = path.resolve(SERVER_ROOT, '../../server/src/core/rooms/invite/redisScripts.ts')

// ---------------------------------------------------------------- 断言与结果收集

const results = []

function resetResults() {
    results.length = 0
}

function fail(message) {
    throw new Error(message)
}

function check(condition, message) {
    if (!condition) fail(message)
}

function equal(actual, expected, label) {
    if (actual !== expected) fail(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}

function deepEqual(actual, expected, label) {
    const a = JSON.stringify(actual)
    const b = JSON.stringify(expected)
    if (a !== b) fail(`${label}: 期望 ${b}，实际 ${a}`)
}

async function scenario(name, fn) {
    const started = Date.now()
    try {
        const detail = await fn()
        results.push({ name, ok: true, detail: detail ?? '', ms: Date.now() - started })
        console.log(`  \u2714 ${name}${detail ? `  \u2014 ${detail}` : ''}`)
    } catch (error) {
        const message = (error && error.message) || String(error)
        results.push({ name, ok: false, detail: message, ms: Date.now() - started })
        console.log(`  \u2718 ${name}  \u2014 ${message}`)
    }
}

// ---------------------------------------------------------------- 平台桩（唯一非真实件）

class StubWebPlatform {
    constructor(contract) {
        this.contract = contract
        this.sessions = new Map()
        this.verifyCalls = 0
        this.registerCalls = 0
        this.origin = ''
        this.server = undefined
    }

    issue(token, serverId, userId) {
        this.sessions.set(`${serverId}:${token}`, { userId, valid: true, reason: 'NOT_FOUND' })
    }

    invalidate(token, serverId, reason) {
        this.sessions.set(`${serverId}:${token}`, { userId: '', valid: false, reason })
    }

    async start() {
        const server = http.createServer((request, response) => void this.handle(request, response))
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        this.server = server
        this.origin = `http://127.0.0.1:${server.address().port}`
    }

    async stop() {
        const server = this.server
        this.server = undefined
        if (!server) return
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }

    async handle(request, response) {
        const chunks = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const verify = this.contract.WebPlatformHttpContractMap.VerifySession
        if (request.method === verify.method && request.url === verify.path) {
            this.verifyCalls += 1
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const session = this.sessions.get(`${payload.serverId}:${payload.accessToken}`)
            const answer =
                session && session.valid === true
                    ? { valid: true, userId: session.userId, issuedAtMs: 1000 }
                    : { valid: false, reason: (session && session.reason) || 'NOT_FOUND' }
            return this.reply(response, answer)
        }
        const register = this.contract.WebPlatformHttpContractMap.RegisterCharacter
        if (request.method === register.method && /^\/v1\/internal\/characters\/[^/]+\/\d+$/.test(request.url || '')) {
            this.registerCalls += 1
            return this.reply(response, { registered: true })
        }
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end('{}')
    }

    reply(response, payload) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
    }
}

// ---------------------------------------------------------------- 真实 ws 客户端

class LobbyClient {
    constructor(socket) {
        this.socket = socket
        this.frames = []
        this.waiter = undefined
        this.closeResult = undefined
        this.closeWaiter = undefined
        socket.on('message', (raw, isBinary) => {
            if (isBinary) {
                this.frames.push({ kind: 'binary' })
                return
            }
            let frame
            try {
                frame = JSON.parse(String(raw))
            } catch {
                frame = { kind: 'unparsable', raw: String(raw) }
            }
            this.deliver(frame)
        })
        socket.on('close', (code, reason) => {
            this.closeResult = { code, reason: reason.toString() }
            if (this.closeWaiter) {
                const pending = this.closeWaiter
                this.closeWaiter = undefined
                pending(this.closeResult)
            }
        })
        socket.on('error', () => undefined)
    }

    static async connect(port) {
        const socket = new WebSocket(`ws://127.0.0.1:${port}`)
        await new Promise((resolve, reject) => {
            socket.once('open', resolve)
            socket.once('error', reject)
        })
        return new LobbyClient(socket)
    }

    deliver(frame) {
        if (this.waiter) {
            const pending = this.waiter
            this.waiter = undefined
            pending.resolve(frame)
        } else {
            this.frames.push(frame)
        }
    }

    send(frame) {
        this.socket.send(JSON.stringify(frame))
    }

    sendText(text) {
        this.socket.send(text)
    }

    sendBinary(payload) {
        this.socket.send(payload)
    }

    next(timeoutMs = 5000) {
        const buffered = this.frames.shift()
        if (buffered) return Promise.resolve(buffered)
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiter = undefined
                reject(new Error('等待 Lobby 帧超时'))
            }, timeoutMs)
            this.waiter = {
                resolve: (frame) => {
                    clearTimeout(timer)
                    resolve(frame)
                },
            }
        })
    }

    /**
     * 收齐满足谓词的帧（顺序不敏感）。生产实现在「推送先于回包」和「回包先于推送」之间
     * 没有契约约束，断言顺序会把实现细节固化成契约，所以这里只断言**集合与条数**。
     *
     * 不匹配的帧在收齐后按原顺序放回队首，⛔ 不能直接丢掉：丢掉会让「先到的推送」凭空消失，
     * 后续断言变成假阴性，而这正是最容易踩到的一种顺序。
     */
    async collect(predicate, count, timeoutMs = 5000) {
        const found = []
        const aside = []
        const deadline = Date.now() + timeoutMs
        try {
            while (found.length < count) {
                const remain = deadline - Date.now()
                if (remain <= 0) fail(`收集帧超时：期望 ${count} 条，实到 ${found.length} 条`)
                const frame = await this.next(remain)
                if (predicate(frame)) found.push(frame)
                else aside.push(frame)
            }
        } finally {
            for (let index = aside.length - 1; index >= 0; index -= 1) this.frames.unshift(aside[index])
        }
        return found
    }

    async expectIdle(windowMs = 400) {
        try {
            const frame = await this.next(windowMs)
            fail(`本应无帧，却收到 ${JSON.stringify(frame)}`)
        } catch (error) {
            if (!/等待 Lobby 帧超时/.test(String(error && error.message))) throw error
        }
    }

    waitClose(timeoutMs = 5000) {
        if (this.closeResult) return Promise.resolve(this.closeResult)
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.closeWaiter = undefined
                reject(new Error('等待连接关闭超时'))
            }, timeoutMs)
            this.closeWaiter = (value) => {
                clearTimeout(timer)
                resolve(value)
            }
        })
    }

    close() {
        try {
            this.socket.close()
        } catch {
            /* 已关闭 */
        }
    }
}

// ---------------------------------------------------------------- 夹具

/**
 * 把一个线路夹具（端口 / 库号 / gmSecret / sid）绑成自检上下文。
 *
 * `nativePort` 由调用方决定（缺省用随机空闲端口），因为多进程下只有 worker 0 绑定它，
 * 而单进程下同一端口就是旧客户端端口之外的那个独立端点。
 */
function createHarness(fixture) {
    const contract = require(path.join(SERVER_ROOT, 'generated/lobby-contract/protocol/lobbyRpc'))
    const httpContract = require(path.join(SERVER_ROOT, 'generated/lobby-contract/protocol/http'))

    const h = {
        SERVER_ROOT,
        GAME_ROOM_SCRIPTS_PATH,
        contract,
        httpContract: { WebPlatformHttpContractMap: httpContract.WebPlatformHttpContractMap },
        StubWebPlatform,
        LobbyClient,
        V: contract.LOBBY_TRANSPORT_VERSION,
        MAX_BYTES: contract.LOBBY_TRANSPORT_MAX_MESSAGE_BYTES,
        UserRpc: contract.UserRpc,
        GuildRpc: contract.GuildRpc,
        RoomRpc: contract.RoomRpc,
        /**
         * income 域的路由名常量。
         *
         * ⚠ 不能像上面三个那样从 façade 取：`lobbyRpc/index.ts` 是**手工维护的稳定 façade**，注释已写明
         * 新增域不再登记进去（`⛔ 本文件与 envelope/push 不再登记`）。生产代码取新域也是直接 import
         * `domains/<域>`（`IncomeNativeLobbyRoutes` 就是这么写的），这里照同一份路径取。
         */
        IncomeRpc: require(path.join(SERVER_ROOT, 'generated/lobby-contract/protocol/lobbyRpc/domains/income'))
            .IncomeRpc,
        KICK_CLOSE_CODE: contract.KICK_CLOSE_CODE,
        ForceLogoutReason: contract.ForceLogoutReason,

        PLATFORM: fixture.platform,
        PLATFORM_VERSION: fixture.platformVersion,
        SID: fixture.sid,
        CLIENT_PORT: fixture.clientPort,
        INTERNAL_PORT: fixture.internalPort,
        CENTER_REDIS_DB: fixture.centerRedisDb,
        USER_REDIS_DB: fixture.userRedisDb,
        GM_SECRET: fixture.gmSecret,
        NATIVE_PORT: fixture.nativePort,
        /** 私房键的命名空间前缀：必须与服务进程读到的 `PROJECT_ID` 一致（子进程环境显式传入）。 */
        PROJECT_ID: process.env.PROJECT_ID ?? 'gono',
        RUN_ID: fixture.runId ?? `${Date.now().toString(36)}`,
        launchMode: fixture.launchMode ?? 'single',
    }
    h.ROOM_KEY_PREFIX = `${h.PROJECT_ID}_room:`
    h.roomQuotaKey = (uid) => `${h.ROOM_KEY_PREFIX}quota:s${h.SID}:{${uid}}`
    h.roomTicketKey = (ticket) =>
        `${h.ROOM_KEY_PREFIX}ticket:s${h.SID}:${crypto.createHash('sha256').update(ticket, 'utf8').digest('hex')}`
    h.roomCodeKey = (code) => `${h.ROOM_KEY_PREFIX}code:{s${h.SID}:${code}}`
    h.roomCodeGenerationKey = (code) => `${h.ROOM_KEY_PREFIX}code:gen:{s${h.SID}:${code}}`

    /**
     * 库号闸：`redis-cli -n <非数字>` **不报错**，静默落到 db 0。
     *
     * 这是真实踩过的坑：单进程线路漏传 `userRedisDb` 时 `-n undefined` 会把夹具写进 0 号库，
     * 而服务进程读 8 号库，症状表现为「登录钩子什么都没做」——排查成本极高，且一旦 0 号库
     * 恰好也有同名键就会变成**假绿**。所以这里宁可硬失败，也不允许任何库号落到字符串化后的
     * 非正整数上。
     */
    for (const [label, value] of [
        ['centerRedisDb', h.CENTER_REDIS_DB],
        ['userRedisDb', h.USER_REDIS_DB],
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            fail(
                `createHarness: fixture.${label} 必须是 >=0 的整数，实际 ${JSON.stringify(value)}。` +
                    '（redis-cli 对非法 -n 不报错、静默落 db 0，会让夹具写到错误的库上）',
            )
        }
    }
    h.redis = (...args) =>
        execFileSync('redis-cli', ['-n', String(h.CENTER_REDIS_DB), ...args], { encoding: 'utf8' }).trim()
    /**
     * 用户库直读/直写。
     *
     * `User` 这类 Hash bean 的键是**引擎自己的**存储契约（`Hash.getRedisKey` → `User_<id>`，
     * 无区服前缀），落在 user Redis 上而不是中心库。用户任务自检要驱动一次真实的用户维度写，
     * 就必须按这份契约准备夹具；⛔ 不要把它说成「生产已有这条链路」，它证明的是接缝本身。
     */
    h.userRedis = (...args) =>
        execFileSync('redis-cli', ['-n', String(h.USER_REDIS_DB), ...args], { encoding: 'utf8' }).trim()
    h.redisMembers = (key) => {
        const raw = h.redis('smembers', key)
        return raw ? raw.split('\n').filter(Boolean) : []
    }
    h.redisListLength = (key) => Number(h.redis('llen', key))
    h.gameRoomScript = (name) => {
        const source = fs.readFileSync(GAME_ROOM_SCRIPTS_PATH, 'utf8')
        const match = new RegExp(`defineScript\\("${name}",\\s*` + '`([\\s\\S]*?)`\\)').exec(source)
        if (!match) {
            fail(`无法从 ${GAME_ROOM_SCRIPTS_PATH} 逐字提取 Lua ${name}（GameRoom 契约已改形状？）`)
        }
        return match[1]
    }
    /**
     * 在真实 Redis 上跑一段 Lua（与 `redis-cli --raw` 一致：平铺数组按行返回）。
     * 本脚本用到的几条脚本最多返回三层以内的一维数组，逐行读即可。
     */
    h.redisEvalRaw = (script, keys, args) => {
        const raw = execFileSync(
            'redis-cli',
            ['-n', String(h.CENTER_REDIS_DB), '--raw', 'eval', script, String(keys.length), ...keys, ...args],
            { encoding: 'utf8' },
        )
        return raw
            .split('\n')
            .map((line) => line.replace(/\r$/, ''))
            .filter((line) => line.length > 0)
    }

    /**
     * 直接 POST 到**主控/服务进程**的内部动作入口（`type: 'lobbyKick'`）。
     *
     * 单进程下这是运营下线的真实落点；多进程下由主控进程把同一请求改写成 `lobby-kick`
     * 管道请求转给监听进程。两种拓扑都用同一个入口、同一份断言——这正是要比较的东西。
     * 断言读的是服务进程自己返回的 `kicked`，不是脚本推算出来的结论。
     */
    h.postInternalAction = (payload) => {
        const body = JSON.stringify(payload)
        return new Promise((resolve, reject) => {
            const request = http.request(
                {
                    host: '127.0.0.1',
                    port: h.INTERNAL_PORT,
                    path: '/internal/action',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': Buffer.byteLength(body),
                        'x-internal-secret': h.GM_SECRET,
                    },
                },
                (response) => {
                    const chunks = []
                    response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
                    response.on('end', () => {
                        const text = Buffer.concat(chunks).toString('utf8')
                        try {
                            resolve({ status: response.statusCode, body: JSON.parse(text) })
                        } catch {
                            reject(new Error(`内部动作入口返回了非 JSON：${text}`))
                        }
                    })
                },
            )
            request.on('error', reject)
            request.end(body)
        })
    }

    h.authFrame = (token, sId, reconnect = false) =>
        reconnect ? { v: h.V, kind: 'auth', token, sId, reconnect: true } : { v: h.V, kind: 'auth', token, sId }
    h.rpc = (id, type, payload = {}) => ({ v: h.V, kind: 'rpc', rpc: { id, type, payload } })
    h.isReplyFor = (id) => (frame) => frame.kind === 'reply' && frame.reply && frame.reply.id === id
    h.isPushOf = (type) => (frame) => frame.kind === 'push' && frame.push && frame.push.type === type

    h.platform = new StubWebPlatform(h.httpContract)

    h.logDir = path.join(SERVER_ROOT, 'log', 'verify')
    h.logPath = path.join(h.logDir, `native-lobby-${h.launchMode}.${h.RUN_ID}.log`)
    /**
     * 读整份服务进程日志。
     *
     * ⛔ 不要只读 `server.tail` 的末尾若干行：多进程下 worker 的 stdout 会汇到 master，
     * 而「跨进程路由痕迹」是在协议场景跑的时候打出来的，用定长尾部窗口会随日志量漂移。
     */
    h.readLog = () => (fs.existsSync(h.logPath) ? fs.readFileSync(h.logPath, 'utf8') : '')

    /** 起一个真实服务进程；`env` 是线路相关的显式覆盖（原生端点、平台桩、进程池开关…）。 */
    h.startServer = (env) => {
        fs.mkdirSync(h.logDir, { recursive: true })
        const stream = fs.createWriteStream(h.logPath, { flags: 'a' })
        const child = spawn(
            process.execPath,
            [
                path.join('deploy', 'dev', 'entrypoint.cjs'),
                '-p',
                h.PLATFORM,
                '-v',
                h.PLATFORM_VERSION,
                '--sid',
                String(h.SID),
            ],
            { cwd: SERVER_ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
        )
        const tail = []
        const mirror = (chunk) => {
            stream.write(chunk)
            for (const line of String(chunk).split('\n')) {
                if (!line.trim()) continue
                tail.push(line)
                if (tail.length > 400) tail.shift()
            }
        }
        child.stdout.on('data', mirror)
        child.stderr.on('data', mirror)
        return { child, stream, tail }
    }

    h.waitUntilReady = async (timeoutMs, server) => {
        const deadline = Date.now() + timeoutMs
        const token = `ready-${h.RUN_ID}`
        const uid = `live-ready-${h.RUN_ID}`
        h.platform.issue(token, h.SID, uid)
        let lastError = '未开始'
        while (Date.now() < deadline) {
            if (server.child.exitCode !== null) {
                fail(
                    `服务进程提前退出（code=${server.child.exitCode}），日志尾部：\n${server.tail.slice(-25).join('\n')}`,
                )
            }
            try {
                const client = await LobbyClient.connect(h.NATIVE_PORT)
                try {
                    client.send({ v: h.V, kind: 'auth', token, sId: h.SID })
                    const frame = await client.next(4000)
                    if (frame.kind === 'auth.ok') return client
                    lastError = `认证未通过：${JSON.stringify(frame)}`
                } finally {
                    client.close()
                }
            } catch (error) {
                lastError = (error && error.message) || String(error)
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
        }
        fail(
            `等待原生端点就绪超时（${timeoutMs}ms），最后错误：${lastError}\n日志尾部：\n${server.tail.slice(-25).join('\n')}`,
        )
    }

    /**
     * 场景用的连接工厂：登记票据 → 建连 → 认证 → 返回 ready 客户端。
     * 每条连接都登记进 `clients`，收尾时统一关闭。
     */
    h.makeConnector =
        (clients) =>
        async (token, uid, sId = h.SID, reconnect = false) => {
            h.platform.issue(token, sId, uid)
            const client = await LobbyClient.connect(h.NATIVE_PORT)
            clients.push(client)
            client.send(h.authFrame(token, sId, reconnect))
            const frame = await client.next()
            check(frame.kind === 'auth.ok', `认证应成功，实际 ${JSON.stringify(frame)}`)
            return client
        }

    return h
}

// ---------------------------------------------------------------- 端口

async function freePort() {
    const probe = net.createServer()
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const port = probe.address().port
    await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
    return port
}

async function assertPortFree(port, label) {
    const probe = net.createServer()
    try {
        await new Promise((resolve, reject) => {
            probe.once('error', reject)
            probe.listen(port, '127.0.0.1', resolve)
        })
    } catch (error) {
        fail(`${label} 端口 ${port} 已被占用：${error.message}`)
    }
    await new Promise((resolve) => probe.close(resolve))
}

// ---------------------------------------------------------------- 进程树

function childPidsOf(pid) {
    const found = []
    const queue = [pid]
    while (queue.length) {
        const parent = queue.shift()
        let children = []
        try {
            children = execFileSync('pgrep', ['-P', String(parent)], { encoding: 'utf8' })
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map(Number)
        } catch {
            /* 没有子进程 */
        }
        found.push(...children)
        queue.push(...children)
    }
    return found
}

function isAlive(pid) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

/** 监听 worker 承载的兼容 `/health`；它不可作为独立 liveness 探针。 */
function getHealth(internalPort) {
    return getJson(internalPort, '/health')
}

/** 主控独立探针（`/livez` / `/readyz`）与内部 HTTP 复用 JSON 读取器。 */
function getProbe(probePort, path) {
    return getJson(probePort, path)
}

function getJson(port, path) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path }, (response) => {
            const chunks = []
            response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            response.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8')
                try {
                    resolve({ status: response.statusCode, body: JSON.parse(text) })
                } catch {
                    reject(new Error(`${path} 返回了非 JSON：${text}`))
                }
            })
        }).once('error', reject)
    })
}

module.exports = {
    SERVER_ROOT,
    GAME_ROOM_SCRIPTS_PATH,
    results,
    resetResults,
    fail,
    check,
    equal,
    deepEqual,
    scenario,
    StubWebPlatform,
    LobbyClient,
    createHarness,
    freePort,
    assertPortFree,
    childPidsOf,
    isAlive,
    getHealth,
    getProbe,
}
