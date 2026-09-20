const assert = require('assert')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const { createLocalWebPlatform } = require(path.join(projectRoot, 'scripts/verify/webplatform-local.cjs'))
const { WebPlatformHttpContractMap } = require(path.join(projectRoot, 'generated/lobby-contract/protocol/http'))

const MAP = WebPlatformHttpContractMap
const SERVICE_ID = 'webplatform-local-test'
const SERVICE_SECRET = 'webplatform-local-secret'

/**
 * 本地 WebPlatform 副本的自检。
 *
 * 为什么值得单独测：它是「真实 Creator 预览驱动原生通道」链上**唯一非真实件**，
 * 一旦它与契约漂移，GUI 侧看到的会是「客户端认证失败」这种指向客户端的假象。
 * 所以这里钉的不是「函数返回值」，而是**契约路径 / 凭证闸 / 三态语义**这些一旦错了
 * 就会把故障指向错误方向的接缝。
 */
describe('local WebPlatform replica', () => {
    let platform
    let credentials

    const post = async (origin, contract, body, headers = {}) => {
        const response = await fetch(origin + contract.path, {
            method: contract.method,
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
        })
        return { status: response.status, body: await response.json() }
    }

    before(async () => {
        platform = createLocalWebPlatform({
            sid: 1,
            host: '127.0.0.1',
            gameHttpUrl: 'http://127.0.0.1:2568',
            gameWsUrl: 'ws://127.0.0.1:2568',
            areaName: '本地开发服',
            serviceId: SERVICE_ID,
            serviceSecret: SERVICE_SECRET,
            log: () => {},
        })
        await platform.start({ publicPort: 0, internalPort: 0 })
        credentials = { 'x-service-id': SERVICE_ID, 'x-service-secret': SERVICE_SECRET }
    })

    after(async () => {
        await platform.stop()
    })

    it('两个 origin 分开：Public 不暴露 Internal 端点', async () => {
        assert.notStrictEqual(platform.publicOrigin, platform.internalOrigin, '必须是两个端口')
        const leaked = await post(platform.publicOrigin, MAP.VerifySession, {}, credentials)
        assert.strictEqual(leaked.status, 404, 'Public 端口不得响应内部端点')
        const served = await post(
            platform.internalOrigin,
            MAP.VerifySession,
            { accessToken: 'x', serverId: 1 },
            credentials,
        )
        assert.strictEqual(served.status, 200, 'Internal 端口必须响应内部端点')
    })

    it('CORS 预检：OPTIONS 204 且回显 origin / 允许 content-type', async () => {
        // 这条不是「顺手测个头」：客户端的 XHR 底座对每个请求都设 Content-Type: application/json，
        // 于是连 GET /v1/areas 都要先过预检。缺了它，真实 Creator 预览里会报
        // `WebPlatform 区服目录加载失败 (status=0)`——看上去像客户端或网络故障。
        const origin = 'http://127.0.0.1:7458'
        const preflight = await fetch(platform.publicOrigin + MAP.ListAreas.path, {
            method: 'OPTIONS',
            headers: {
                origin,
                'access-control-request-method': MAP.ListAreas.method,
                'access-control-request-headers': 'content-type',
            },
        })
        assert.strictEqual(preflight.status, 204, '预检必须 204')
        assert.strictEqual(preflight.headers.get('access-control-allow-origin'), origin, '必须回显 origin')
        assert.match(
            String(preflight.headers.get('access-control-allow-headers')),
            /content-type/iu,
            '必须放行 content-type（客户端每个请求都带它）',
        )
        assert.strictEqual(preflight.headers.get('vary'), 'Origin', '回显 origin 必须带 Vary')

        const actual = await fetch(platform.publicOrigin + MAP.ListAreas.path, { headers: { origin } })
        assert.strictEqual(actual.headers.get('access-control-allow-origin'), origin, '实际请求也要带 CORS 头')

        // Internal 是服务对服务：没有浏览器 origin 参与，不该回 CORS 头。
        const internal = await fetch(platform.internalOrigin + MAP.ListAreas.path, { headers: { origin } })
        assert.strictEqual(internal.headers.get('access-control-allow-origin'), null, 'Internal 不回 CORS 头')
    })

    it('选服目录：区号与游戏端点来自构造参数，且出参过契约校验', async () => {
        const response = await fetch(platform.publicOrigin + MAP.ListAreas.path)
        assert.strictEqual(response.status, 200)
        const body = await response.json()
        // 出参必须能再过一遍契约校验：副本与契约漂移要当场失败，而不是回一份野形状。
        assert.doesNotThrow(() => MAP.ListAreas.response(body))
        assert.strictEqual(body.servers.length, 1)
        assert.strictEqual(body.servers[0].serverId, 1, '区号必须是副本服务的区（原生 Lobby 会按它比对）')
        assert.strictEqual(body.servers[0].gameHttpUrl, 'http://127.0.0.1:2568')
        assert.strictEqual(body.servers[0].openTime > 0, true, 'openTime>0 才过客户端进服闸')
    })

    it('dev 登录：同 key 恒同号、isNewAccount 只首次为真', async () => {
        const first = await post(platform.publicOrigin, MAP.DevLogin, { devKey: 'dev_local', serverId: 1 })
        const second = await post(platform.publicOrigin, MAP.DevLogin, { devKey: 'dev_local', serverId: 1 })
        assert.strictEqual(first.status, 200)
        assert.doesNotThrow(() => MAP.DevLogin.response(first.body))
        assert.strictEqual(first.body.isNewAccount, true, '首次签发必须报告新账号')
        assert.strictEqual(second.body.userId, first.body.userId, '同 devKey 必须恒同号')
        assert.strictEqual(second.body.isNewAccount, false, '二次签发不是新账号')
        assert.notStrictEqual(second.body.accessToken, first.body.accessToken, '每次登录都要发新票')

        const other = await post(platform.publicOrigin, MAP.DevLogin, { devKey: 'dev_other', serverId: 1 })
        assert.notStrictEqual(other.body.userId, first.body.userId, '换 key 即换号')
    })

    it('dev 登录：错区与非法 payload 一律拒绝，不发「别的区」的票', async () => {
        // 发了别的区的票再由服务端拒绝，会把「配置指错了区」伪装成「客户端认证失败」。
        const wrongZone = await post(platform.publicOrigin, MAP.DevLogin, { devKey: 'dev_local', serverId: 2 })
        assert.strictEqual(wrongZone.status, 400, '错区必须就地拒绝')
        assert.match(String(wrongZone.body.error), /serves sid=1/)

        const extraKey = await post(platform.publicOrigin, MAP.DevLogin, {
            devKey: 'dev_local',
            serverId: 1,
            surprise: true,
        })
        assert.strictEqual(extraKey.status, 400, '契约外字段必须拒绝（exact-keys）')
        assert.match(String(extraKey.body.error), /contract/)
    })

    it('verify：缺凭证 401；有票 valid；票在但区不同 MISMATCH；票不存在 NOT_FOUND', async () => {
        const login = await post(platform.publicOrigin, MAP.DevLogin, { devKey: 'dev_verify', serverId: 1 })
        const token = login.body.accessToken

        const unauthorized = await post(platform.internalOrigin, MAP.VerifySession, { accessToken: token, serverId: 1 })
        assert.strictEqual(unauthorized.status, 401, '内部端点缺服务凭证必须 401')

        const ok = await post(
            platform.internalOrigin,
            MAP.VerifySession,
            { accessToken: token, serverId: 1 },
            credentials,
        )
        assert.doesNotThrow(() => MAP.VerifySession.response(ok.body))
        assert.strictEqual(ok.body.valid, true)
        assert.strictEqual(ok.body.userId, login.body.userId, 'verify 必须回签发时的账号')
        assert.strictEqual(Number.isSafeInteger(ok.body.issuedAtMs), true, 'issuedAtMs 是会话纪元的一部分，必须是整数')

        const mismatch = await post(
            platform.internalOrigin,
            MAP.VerifySession,
            { accessToken: token, serverId: 2 },
            credentials,
        )
        assert.deepStrictEqual(mismatch.body, { valid: false, reason: 'MISMATCH' }, '票在但区不同是 MISMATCH')

        const notFound = await post(
            platform.internalOrigin,
            MAP.VerifySession,
            { accessToken: 'no-such-token', serverId: 1 },
            credentials,
        )
        assert.deepStrictEqual(notFound.body, { valid: false, reason: 'NOT_FOUND' }, '票不存在是 NOT_FOUND')
    })

    it('角色登记：register 之后 has 才为真，且出参过契约校验', async () => {
        const login = await post(platform.publicOrigin, MAP.DevLogin, { devKey: 'dev_character', serverId: 1 })
        const userId = login.body.userId
        const characterPath = (id) => MAP.RegisterCharacter.path.replace('{userId}', id).replace('{serverId}', '1')

        const before = await fetch(platform.internalOrigin + characterPath(userId), { headers: credentials })
        const beforeBody = await before.json()
        assert.doesNotThrow(() => MAP.HasCharacter.response(beforeBody))
        assert.strictEqual(beforeBody.exists, false, '未登记前必须 exists=false')

        const register = await fetch(platform.internalOrigin + characterPath(userId), {
            method: MAP.RegisterCharacter.method,
            headers: credentials,
        })
        assert.strictEqual(register.status, 200)
        const registered = await register.json()
        assert.doesNotThrow(() => MAP.RegisterCharacter.response(registered))

        const after = await fetch(platform.internalOrigin + characterPath(userId), { headers: credentials })
        assert.strictEqual((await after.json()).exists, true, '登记后必须 exists=true')
    })
})
