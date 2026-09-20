#!/usr/bin/env node
'use strict'

/**
 * 本地 WebPlatform 副本（Public + Internal）——**唯一非真实件**，但只非真实在「账号签发」这一层。
 *
 * 为什么需要它：`serverNew` 的原生 Lobby 在**每一次** RPC 前都要回源复验票据
 * （`WebPlatformSessionVerifier.verify` → `POST /v1/internal/sessions/verify`），
 * 而真实 WebPlatform 是**独立服务、不在本仓**（仓内只有它的消费契约 `generated/webplatform`）。
 * 于是「真实 Creator 预览驱动原生通道」缺的正是这个 origin：没有它，客户端连得上 ws，
 * 却会在 auth 帧被回源拒绝。
 *
 * 与 `native-lobby-live.cjs` 里的 `StubWebPlatform` 的分工是刻意的，⛔ 不要合并：
 *  - 那个桩只实现 Internal 两个端点，票据由脚本自己 `issue()` 注入——它验证的是**服务端协议**，
 *    不需要也不应该依赖 Public 契约（多实现一份就等于多一处漂移面）。
 *  - 本副本要实现 Public（选服目录 + dev 登录）才能让**真实客户端**自己拿到票，
 *    验证的是**客户端 → 原生通道**这条链。
 *
 * 真实性边界（⛔ 不宣称生产已验证）：
 *  - 契约是真的：路径、方法、请求/响应校验全部取自 `generated/lobby-contract/protocol/http`，
 *    且**每个出参都过一遍契约 response 校验**——副本与契约漂移会当场抛错，而不是悄悄回一份野形状。
 *  - 会话存储是进程内内存，不是真实账号库；重启即失效。
 *  - dev 身份签发是本地复刻（`devKey + serverId` → 稳定 userId），不是生产 WebPlatform 的账号体系。
 *
 * 用法：
 *   node scripts/verify/webplatform-local.cjs --sid 1 \
 *        --game-http http://127.0.0.1:2568 --game-ws ws://127.0.0.1:2568 \
 *        [--public-port 2570] [--internal-port 2571] \
 *        [--service-id game-local] [--service-secret local-secret]
 *
 * 打印 `PUBLIC_ORIGIN=…` / `INTERNAL_ORIGIN=…` 两行后保持前台运行（SIGINT/SIGTERM 关闭）。
 */

const crypto = require('node:crypto')
const http = require('node:http')
const path = require('node:path')

const SERVER_ROOT = path.resolve(__dirname, '..', '..')
const { WebPlatformHttpContractMap } = require(path.join(SERVER_ROOT, 'generated/lobby-contract/protocol/http'))

const MAP = WebPlatformHttpContractMap

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

/** dev 身份签发：同 (devKey, serverId) 恒同号，换 key 即换号——与客户端 DEV_LOGIN_KEY 的语义一致。 */
function devUserId(devKey, serverId) {
    return `dev-${crypto.createHash('sha256').update(`${devKey}:${serverId}`).digest('hex').slice(0, 16)}`
}

class LocalWebPlatform {
    constructor(options) {
        this.sid = options.sid
        this.host = options.host
        this.gameHttpUrl = options.gameHttpUrl
        this.gameWsUrl = options.gameWsUrl
        this.areaName = options.areaName
        this.serviceId = options.serviceId
        this.serviceSecret = options.serviceSecret
        this.log = options.log
        /** `${serverId}:${token}` → 会话；只在本进程内存里。 */
        this.sessions = new Map()
        /** 首次出现的 userId：决定 `isNewAccount`。 */
        this.known = new Set()
        /** 已登记角色的 `${userId}:${serverId}`（`RegisterCharacter` / `HasCharacter` 的存储面）。 */
        this.characters = new Set()
        this.servers = []
        this.publicOrigin = ''
        this.internalOrigin = ''
        /** 计数只用于自检报告，不参与任何判定。 */
        this.stats = { devLogin: 0, listAreas: 0, verify: 0, register: 0, rejected: 0 }
    }

    /** 供进程内调用（测试/自检）注入一张已知票；真实客户端走 `POST /v1/sessions/dev`。 */
    issue(token, serverId, userId) {
        this.sessions.set(`${serverId}:${token}`, { userId, issuedAtMs: Date.now() })
    }

    /**
     * 起 Public 与 Internal 两个 origin。
     *
     * 分成两个端口不是为了好看：`.env.development` 的既定拓扑就是「Public :2570 / Internal :2571」，
     * 且真实客户端只该看见 Public。同端口会把「服务端把内部端点暴露给了客户端」这种错误
     * 在本副本里变得不可观测。
     */
    async start({ publicPort = 0, internalPort = 0 } = {}) {
        this.publicServer = await this.listen(publicPort, this.handlePublic)
        this.publicOrigin = originOf(this.publicServer)
        this.internalServer = await this.listen(internalPort, this.handleInternal)
        this.internalOrigin = originOf(this.internalServer)
    }

    async stop() {
        for (const server of [this.publicServer, this.internalServer]) {
            if (!server) continue
            await new Promise((resolve) => server.close(() => resolve()))
        }
        this.publicServer = undefined
        this.internalServer = undefined
    }

    listen(port, handler) {
        return new Promise((resolve, reject) => {
            const server = http.createServer((request, response) => void handler.call(this, request, response))
            server.once('error', reject)
            server.listen(port, this.host, () => {
                server.removeListener('error', reject)
                resolve(server)
            })
        })
    }

    // ------------------------------------------------------------ Public

    /**
     * 浏览器预览是**跨源**调用（预览页在 :745x，Public 在 :2570），而客户端的 XHR 底座对
     * **每个**请求都设 `Content-Type: application/json`（`core/http.ts` 的 doRequest），
     * 于是连 `GET /v1/areas` 都不是简单请求——**每次调用都先发 OPTIONS 预检**。
     *
     * ⛔ 这不是「顺手加的宽松头」：缺了它，客户端拿到的是 `status=0` 并报
     * `WebPlatform 区服目录加载失败`，看上去像客户端或网络故障，实际是本副本缺预检。
     * 头集合逐条对齐旧 `apps/server` 的 dev 端点（仓内唯一可参照的 Public 形状）。
     * 只加在 Public 侧：Internal 是服务对服务，没有浏览器 origin 参与。
     */
    corsHeaders(request) {
        const origin = request.headers.origin
        if (!origin) return {}
        return {
            'access-control-allow-origin': origin,
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
            'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
            'access-control-max-age': '2592000',
            // 回显 origin 必须带 Vary，否则中间缓存会把 A 源的响应喂给 B 源。
            vary: 'Origin',
        }
    }

    async handlePublic(request, response) {
        const url = new URL(request.url ?? '/', 'http://internal')
        const cors = this.corsHeaders(request)
        if (request.method === 'OPTIONS') return this.reply(response, 204, undefined, cors)
        if (request.method === MAP.ListAreas.method && url.pathname === MAP.ListAreas.path) {
            this.stats.listAreas += 1
            MAP.ListAreas.request({})
            return this.reply(response, 200, MAP.ListAreas.response(this.areaList()), cors)
        }
        if (request.method === MAP.DevLogin.method && url.pathname === MAP.DevLogin.path) {
            const body = await this.readJson(request, response, cors)
            if (body === undefined) return
            let payload
            try {
                payload = MAP.DevLogin.request(body)
            } catch (error) {
                return this.reject(response, 400, `dev login payload violates the contract: ${messageOf(error)}`, cors)
            }
            // 本副本只服务一个区。别的区的票在这里发不出来，而不是发出来再让服务端拒绝——
            // 后者会把「配置指错了区」伪装成「客户端认证失败」。
            if (payload.serverId !== this.sid) {
                return this.reject(
                    response,
                    400,
                    `local WebPlatform serves sid=${this.sid}, refused sid=${payload.serverId}`,
                    cors,
                )
            }
            this.stats.devLogin += 1
            const userId = devUserId(payload.devKey, payload.serverId)
            const isNewAccount = !this.known.has(userId)
            this.known.add(userId)
            const accessToken = `devtk-${crypto.randomUUID()}`
            this.sessions.set(`${payload.serverId}:${accessToken}`, { userId, issuedAtMs: Date.now() })
            return this.reply(response, 200, MAP.DevLogin.response({ userId, accessToken, isNewAccount }), cors)
        }
        return this.reject(response, 404, 'not found', cors)
    }

    areaList() {
        return {
            hash: `local-webplatform-${this.sid}`,
            // `isOps` 是部署环境级开关（客户端进服闸的豁免位）；本地副本不是运维形态。
            isOps: false,
            myServerIds: [],
            servers: [
                {
                    serverId: this.sid,
                    name: this.areaName,
                    status: 'smooth',
                    tag: 'normal',
                    // `openTime > 0` 才可进（客户端 isServerEnterable）；本地副本恒可进。
                    openTime: 1,
                    gameHttpUrl: this.gameHttpUrl,
                    gameWsUrl: this.gameWsUrl,
                },
            ],
        }
    }

    // ------------------------------------------------------------ Internal

    async handleInternal(request, response) {
        const url = new URL(request.url ?? '/', 'http://internal')
        if (!this.authorized(request)) {
            this.stats.rejected += 1
            return this.reject(response, 401, 'internal service credentials required')
        }

        if (request.method === MAP.VerifySession.method && url.pathname === MAP.VerifySession.path) {
            const body = await this.readJson(request, response)
            if (body === undefined) return
            let payload
            try {
                payload = MAP.VerifySession.request(body)
            } catch (error) {
                return this.reject(response, 400, `verify payload violates the contract: ${messageOf(error)}`)
            }
            this.stats.verify += 1
            const session = this.sessions.get(`${payload.serverId}:${payload.accessToken}`)
            // 票据存在但区不匹配 ⇒ MISMATCH；查不到 ⇒ NOT_FOUND。两者都回 `valid:false`，
            // 由服务端决定拒绝方式——副本不替它判断「哪种失败更严重」。
            const answer = session
                ? { valid: true, userId: session.userId, issuedAtMs: session.issuedAtMs }
                : { valid: false, reason: this.knownToken(payload.accessToken) ? 'MISMATCH' : 'NOT_FOUND' }
            return this.reply(response, 200, MAP.VerifySession.response(answer))
        }

        const register = matchPath(MAP.RegisterCharacter.path, url.pathname)
        if (request.method === MAP.RegisterCharacter.method && register) {
            MAP.RegisterCharacter.request({})
            this.characters.add(`${register.userId}:${register.serverId}`)
            this.stats.register += 1
            return this.reply(response, 200, MAP.RegisterCharacter.response({ registered: true }))
        }
        const has = matchPath(MAP.HasCharacter.path, url.pathname)
        if (request.method === MAP.HasCharacter.method && has) {
            MAP.HasCharacter.request({})
            return this.reply(
                response,
                200,
                MAP.HasCharacter.response({ exists: this.characters.has(`${has.userId}:${has.serverId}`) }),
            )
        }
        return this.reject(response, 404, 'not found')
    }

    /** 同一张票换区来验：能查到票但区不同。仅用于把 NOT_FOUND 与 MISMATCH 区分开。 */
    knownToken(token) {
        for (const key of this.sessions.keys()) if (key.endsWith(`:${token}`)) return true
        return false
    }

    authorized(request) {
        return (
            request.headers['x-service-id'] === this.serviceId &&
            request.headers['x-service-secret'] === this.serviceSecret
        )
    }

    // ------------------------------------------------------------ 传输

    async readJson(request, response, extraHeaders = {}) {
        const chunks = []
        let length = 0
        for await (const chunk of request) {
            length += chunk.length
            if (length > 64 * 1024) {
                this.reject(response, 413, 'request too large', extraHeaders)
                return undefined
            }
            chunks.push(Buffer.from(chunk))
        }
        try {
            return JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
            this.reject(response, 400, 'invalid JSON', extraHeaders)
            return undefined
        }
    }

    reply(response, status, payload, extraHeaders = {}) {
        const headers = { ...extraHeaders }
        // 204 预检没有 body：带上 content-length 会让部分客户端判成畸形响应。
        if (payload === undefined) {
            response.writeHead(status, headers)
            response.end()
            return
        }
        const body = JSON.stringify(payload)
        headers['content-type'] = 'application/json'
        headers['content-length'] = Buffer.byteLength(body)
        response.writeHead(status, headers)
        response.end(body)
    }

    reject(response, status, reason, extraHeaders = {}) {
        this.log(`  [webplatform-local] ${status} ${reason}`)
        this.reply(response, status, { error: reason }, extraHeaders)
    }
}

function originOf(server) {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    return `http://127.0.0.1:${port}`
}

/** 把 `/v1/internal/characters/{userId}/{serverId}` 形式的契约路径解析成参数；不匹配回 undefined。 */
function matchPath(template, pathname) {
    const names = []
    const pattern = template
        .split('/')
        .map((segment) => {
            const capture = /^\{(.+)\}$/.exec(segment)
            if (!capture) return escapeRegExp(segment)
            names.push(capture[1])
            return '([^/]+)'
        })
        .join('/')
    const matched = new RegExp(`^${pattern}$`).exec(pathname)
    if (!matched) return undefined
    const values = {}
    names.forEach((name, index) => {
        values[name] = decodeURIComponent(matched[index + 1])
    })
    return values
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function messageOf(error) {
    return (error && error.message) || String(error)
}

function createLocalWebPlatform(options) {
    return new LocalWebPlatform(options)
}

async function main() {
    const options = parseOptions(process.argv.slice(2))
    const publicPort = Number(options['public-port'] ?? 2570)
    const internalPort = Number(options['internal-port'] ?? 2571)
    if (publicPort === internalPort) throw new Error('public and internal ports must differ')

    const platform = createLocalWebPlatform({
        sid: Number(options.sid ?? 1),
        host: options.host ?? '127.0.0.1',
        gameHttpUrl: options['game-http'] ?? 'http://127.0.0.1:2568',
        gameWsUrl: options['game-ws'] ?? 'ws://127.0.0.1:2568',
        areaName: options['area-name'] ?? '本地开发服',
        serviceId: options['service-id'] ?? 'game-local',
        serviceSecret: options['service-secret'] ?? 'local-service-secret',
        log: (line) => console.log(line),
    })
    // 端口由调用方显式指定（客户端场景要把它写进 portalUrl），所以不用 `listen(0)` 取随机端口。
    await platform.start({ publicPort, internalPort })
    console.log(`PUBLIC_ORIGIN=${platform.publicOrigin}`)
    console.log(`INTERNAL_ORIGIN=${platform.internalOrigin}`)
    console.log(
        `SERVICE_ID=${platform.serviceId} SERVICE_SECRET=${platform.serviceSecret} SID=${platform.sid} ` +
            `AREA=${platform.areaName} GAME_HTTP=${platform.gameHttpUrl} GAME_WS=${platform.gameWsUrl}`,
    )

    const shutdown = async () => {
        await platform.stop()
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`webplatform-local 启动失败：${messageOf(error)}`)
        process.exit(1)
    })
}

module.exports = { LocalWebPlatform, createLocalWebPlatform, devUserId, matchPath }
