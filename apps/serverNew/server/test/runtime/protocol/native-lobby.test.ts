import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { NativeLobbyContractCodec } from '../../../src/runtime/protocol/NativeLobbyContractCodec'
import { WebPlatformSessionVerifier } from '../../../src/runtime/identity/WebPlatformSessionVerifier'
import { NativeLobbyAuthProvider } from '../../../src/runtime/identity/NativeLobbyAuthProvider'
import { NativeLobbyRouteRegistry } from '../../../src/runtime/lobby/NativeLobbyRouteRegistry'
import { GameModuleCatalog } from '../../../src/startup/GameModuleCatalog'
import { WebPlatformHttpContractMap } from '../../../generated/lobby-contract/protocol/http'
import {
    ForceLogoutReason,
    KICK_CLOSE_CODE,
    LOBBY_TRANSPORT_VERSION,
    UserRpc,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'
import { LobbyAuthRejection } from '@arthropoda/game-engine'

describe('native Lobby shared wire and identity boundary', () => {
    it('uses shared exact validators on both directions and refuses numeric errors / extra data', () => {
        const codec = new NativeLobbyContractCodec()
        const auth = { v: LOBBY_TRANSPORT_VERSION, kind: 'auth', token: 'opaque', sId: 7 }
        assert.deepEqual(codec.decodeClient(JSON.stringify(auth)), auth)
        assert.throws(() => codec.decodeClient(JSON.stringify({ ...auth, uid: 'forged' })))
        assert.throws(() => codec.decodeClient(JSON.stringify({ ...auth, v: 1000 })))
        assert.throws(() =>
            codec.decodeClient(JSON.stringify({ v: LOBBY_TRANSPORT_VERSION, kind: 'auth.ok', uid: 'forged', sId: 7 })),
        )
        assert.deepEqual(codec.validateResponse(UserRpc.GetUserId, { uid: 'external-9007199254740993' }), {
            uid: 'external-9007199254740993',
        })
        assert.throws(() => codec.validateResponse(UserRpc.GetInfo, { user: null }))
        assert.throws(() => codec.validateRequest(UserRpc.GetInfo, { extra: true }))
        assert.throws(() => codec.validateResponse(UserRpc.GetUserId, { uid: 'u', _mod: {} }))
        assert.throws(() =>
            codec.encodeServer({ kind: 'reply', reply: { id: 'r', ok: false, err: { code: '123', msg: '' } } }),
        )
    })

    it('verifies opaque tokens over the existing HTTP contract and distinguishes service faults from rejection', async () => {
        let response: unknown = { valid: true, userId: 'external-9007199254740993', issuedAtMs: 123 }
        let status = 200
        let requests = 0
        const host = http.createServer(async (req, res) => {
            requests++
            assert.equal(req.headers['x-service-id'], 'game-test')
            assert.equal(req.headers['x-service-secret'], 'test-secret')
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(Buffer.from(chunk))
            if (req.url === WebPlatformHttpContractMap.VerifySession.path) {
                assert.equal(req.method, WebPlatformHttpContractMap.VerifySession.method)
                assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), {
                    accessToken: 'opaque-token',
                    serverId: 7,
                })
            } else {
                assert.equal(req.url, '/v1/internal/characters/external-9007199254740993/7')
                assert.equal(req.method, WebPlatformHttpContractMap.RegisterCharacter.method)
                assert.equal(Buffer.concat(chunks).length, 0)
            }
            res.writeHead(status, { 'content-type': 'application/json' })
            res.end(JSON.stringify(response))
        })
        await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve))
        const origin = `http://127.0.0.1:${(host.address() as AddressInfo).port}`
        const verifier = new WebPlatformSessionVerifier({
            origin,
            serviceId: 'game-test',
            serviceSecret: 'test-secret',
        })
        try {
            assert.deepEqual(await verifier.verify('opaque-token', 7), response)
            response = { registered: true }
            await verifier.registerCharacter('external-9007199254740993', 7)
            assert.equal(requests, 2)
            response = { valid: false, reason: 'BANNED' }
            assert.deepEqual(await verifier.verify('opaque-token', 7), response)
            response = { valid: true, userId: 'u', issuedAtMs: 123, unexpected: true }
            await assert.rejects(() => verifier.verify('opaque-token', 7), /violates its contract/)
            status = 401
            response = { message: 'service credential rejected' }
            await assert.rejects(() => verifier.verify('opaque-token', 7), /HTTP 401/)
            assert.equal(requests, 5)
        } finally {
            verifier.close()
            await new Promise<void>((resolve, reject) => host.close((error) => (error ? reject(error) : resolve())))
        }
    })

    it('keeps opaque tokens outside the connection context and rechecks the issuer on every RPC', async () => {
        let issuedAtMs = 123
        let valid = true
        const calls: string[] = []
        const verifier = {
            verify: async (token: string, sId: number) => {
                calls.push(`${token}:${sId}`)
                return valid
                    ? { valid: true as const, userId: 'external-9007199254740993', issuedAtMs }
                    : { valid: false as const, reason: 'EXPIRED' as const }
            },
        } as unknown as WebPlatformSessionVerifier
        const provider = new NativeLobbyAuthProvider({
            verifier,
            identities: { resolve: async () => 1001 },
            serverId: 7,
        })
        const identity = await provider.authenticate({
            token: 'opaque-token',
            sId: 7,
            ip: '127.0.0.1',
            reconnect: false,
        })
        assert.equal(identity.uid, 'external-9007199254740993')
        assert.notEqual(identity.sessionEpoch, 'opaque-token')
        const context = { ...identity, connectionId: 'c1', ip: '127.0.0.1' }
        await provider.claimOnline(context)
        assert.equal(await provider.validateActive(context), null)
        issuedAtMs = 124
        await provider.authenticate({ token: 'new-opaque-token', sId: 7, ip: '127.0.0.1', reconnect: false })
        assert.deepEqual(await provider.validateActive(context), { code: 'AUTH_EPOCH_STALE', msg: '会话已更新' })
        valid = false
        assert.deepEqual(await provider.validateActive(context), { code: 'AUTH_REQUIRED', msg: '会话已失效' })
        assert.deepEqual(calls, [
            'opaque-token:7',
            'opaque-token:7',
            'new-opaque-token:7',
            'opaque-token:7',
            'opaque-token:7',
        ])
        await provider.releaseOnline(context)
    })

    it('maps bans, replaces and revokes onto the frozen kick close codes', async () => {
        const kicks: Array<{ connectionId: string; code: string; closeCode: number }> = []
        const provider = new NativeLobbyAuthProvider({
            verifier: { verify: async () => ({ valid: false, reason: 'BANNED' as const }) } as never,
            identities: { resolve: async () => 1001 },
            serverId: 7,
        })
        provider.setForceLogout((connectionId, error, closeCode) =>
            kicks.push({ connectionId, code: error.code, closeCode }),
        )
        // 封号不是普通登录失败：必须给出 ACCOUNT_BANNED + 4901 + 强制下线标记。
        await assert.rejects(
            () => provider.authenticate({ token: 'opaque', sId: 7, ip: '127.0.0.1', reconnect: false }),
            (error: unknown) => {
                assert.ok(error instanceof LobbyAuthRejection)
                assert.equal(error.code, 'ACCOUNT_BANNED')
                assert.equal(error.closeCode, KICK_CLOSE_CODE[ForceLogoutReason.Banned])
                assert.equal(error.forceLogout, true)
                return true
            },
        )

        let issuedAtMs = 100
        const sessions = new NativeLobbyAuthProvider({
            verifier: {
                verify: async (token: string) => ({ valid: true as const, userId: token, issuedAtMs }),
            } as never,
            identities: { resolve: async () => 1001 },
            serverId: 7,
        })
        sessions.setForceLogout((connectionId, error, closeCode) =>
            kicks.push({ connectionId, code: error.code, closeCode }),
        )
        const first = await sessions.authenticate({ token: 'uid-a', sId: 7, ip: '', reconnect: false })
        await sessions.claimOnline({ ...first, connectionId: 'c1', ip: '' })
        // 顶号：新连接就位后才踢旧连接，且必须是 4902。
        const second = await sessions.authenticate({ token: 'uid-a', sId: 7, ip: '', reconnect: false })
        await sessions.claimOnline({ ...second, connectionId: 'c2', ip: '' })
        assert.deepEqual(kicks.at(-1), {
            connectionId: 'c1',
            code: 'AUTH_EPOCH_STALE',
            closeCode: KICK_CLOSE_CODE[ForceLogoutReason.Replaced],
        })
        // 旧连接的迟到清理不得抹掉新会话。
        await sessions.releaseOnline({ ...first, connectionId: 'c1', ip: '' })
        assert.equal(sessions.connectionId('uid-a', 7), 'c2')

        assert.equal(sessions.revoke('uid-a', 7), true)
        assert.deepEqual(kicks.at(-1), {
            connectionId: 'c2',
            code: 'AUTH_EPOCH_STALE',
            closeCode: KICK_CLOSE_CODE[ForceLogoutReason.Revoked],
        })
        assert.equal(sessions.connectionId('uid-a', 7), undefined)
        assert.equal(sessions.revoke('uid-a', 7), false)
        assert.deepEqual(
            [ForceLogoutReason.Banned, ForceLogoutReason.Replaced, ForceLogoutReason.Revoked].map(
                (reason) => KICK_CLOSE_CODE[reason],
            ),
            [4901, 4902, 4903],
        )
    })

    it('lets the GM bridge revoke an online connection by internal role_id without weakening external uid isolation', async () => {
        const kicks: Array<{ connectionId: string; closeCode: number }> = []
        const sessions = new NativeLobbyAuthProvider({
            verifier: {
                verify: async (token: string) => ({ valid: true as const, userId: token, issuedAtMs: 1 }),
            } as never,
            identities: { resolve: async (uid) => (uid === 'external-a' ? 1001 : 1002) },
            serverId: 7,
        })
        sessions.setForceLogout((connectionId, _error, closeCode) => kicks.push({ connectionId, closeCode }))
        const first = await sessions.authenticate({ token: 'external-a', sId: 7, ip: '', reconnect: false })
        const second = await sessions.authenticate({ token: 'external-b', sId: 7, ip: '', reconnect: false })
        await sessions.claimOnline({ ...first, connectionId: 'c-a', ip: '' })
        await sessions.claimOnline({ ...second, connectionId: 'c-b', ip: '' })

        assert.equal(sessions.revokeByInternalUid(1001, 7), true)
        assert.equal(sessions.connectionId('external-a', 7), undefined)
        assert.equal(sessions.connectionId('external-b', 7), 'c-b')
        assert.deepEqual(kicks, [{ connectionId: 'c-a', closeCode: KICK_CLOSE_CODE[ForceLogoutReason.Revoked] }])
        assert.equal(sessions.revokeByInternalUid(1001, 7), false, '已踢掉的旧 role_id 不得命中残留索引')
        assert.equal(sessions.revokeByInternalUid(1002, 8), false, '不得跨区命中同一内部 role_id')
    })

    it('does not permit a partial module registry to masquerade as a runnable native Lobby', () => {
        const routes = new NativeLobbyRouteRegistry(routeRegistryOptions())
        routes.register('user.getInfo', async () => ({ user: {} }))
        assert.throws(() => routes.assertComplete(), /missing=.*arena\.board/)
        assert.throws(() => routes.register('user.getInfo', async () => ({})), /duplicate native Lobby route/)
    })

    it('discovers native Lobby routes only through their owning module contributions', () => {
        const routes = new NativeLobbyRouteRegistry(routeRegistryOptions())
        const handlers: Array<(uid: string, internalUid: number, sId: number) => Promise<void>> = []
        for (const entry of GameModuleCatalog.systems.nativeLobby.entries) {
            entry.contribution.register(routes, {
                identities: { resolve: async () => 1001 },
                registerCharacter: async () => undefined,
                pushToUser: async () => false,
                onAuthenticated: (handler) => handlers.push(handler),
                onReleased: () => undefined,
            })
        }
        assert.equal(routes.has('user.getInfo'), true)
        assert.equal(routes.has('guild.join'), true)
        assert.equal(routes.has('mail.list'), true)
        assert.equal(routes.has('arena.board'), true)
        assert.equal(routes.has('arenaShop.buyBoost'), true)
        assert.equal(routes.has('slg.mapTiles'), true)
        assert.equal(routes.has('slg.marchRecall'), true)
        assert.equal(routes.has('snakeCosmetic.getSnapshot'), true)
        assert.equal(routes.has('snakeCosmetic.equip'), true)
        assert.equal(routes.has('snakeCosmetic.unlock'), true)
        /**
         * 登录钩子（`onAuthenticated`）的贡献者**必须点名**，⛔ 不许用魔数：新增一个「登录时改玩家
         * 状态」的钩子是有副作用的决定（会在每条 RPC 之前重跑），多一个都要有人明确同意。
         * 当前两个：`user.ensure`（建档）+ `income.parkOffline`（离线收益暂存）。
         */
        const authHookOwners = ['income', 'user']
        const contributing = new Set(GameModuleCatalog.systems.nativeLobby.entries.map((entry) => entry.moduleName))
        for (const owner of authHookOwners) {
            assert.equal(contributing.has(owner), true, `清单里的 ${owner} 未贡献原生 Lobby 路由（清单已陈旧）`)
        }
        assert.equal(handlers.length, authHookOwners.length)
        // 模块贡献必须覆盖 shared 全集，否则启动期 assertComplete 会拒绝启动。
        assert.doesNotThrow(() => routes.assertComplete())
    })

    it('refuses to run idempotent-write routes without the generic idempotency gate', async () => {
        // 路由全集齐全、但没接通用幂等闸：必须拒绝启动，而不是让重试重复扣费。
        const ungated = new NativeLobbyRouteRegistry()
        for (const entry of GameModuleCatalog.systems.nativeLobby.entries) {
            entry.contribution.register(ungated, {
                identities: { resolve: async () => 1001 },
                registerCharacter: async () => undefined,
                pushToUser: async () => false,
                onAuthenticated: () => undefined,
                onReleased: () => undefined,
            })
        }
        assert.throws(() => ungated.assertComplete(), /idempotency gate/)
        await assert.rejects(
            () => ungated.execute('arena.capture', context(), { clientReqId: 'req-1', tile: 0 }),
            /idempotency gate/,
        )
    })

    it('serves exactly one fixed zone and rejects other zones before asking the identity service', async () => {
        const calls: string[] = []
        const provider = new NativeLobbyAuthProvider({
            verifier: {
                verify: async (token: string, sId: number) => {
                    calls.push(`${token}:${sId}`)
                    return { valid: true as const, userId: token, issuedAtMs: 1 }
                },
            } as never,
            identities: { resolve: async () => 1001 },
            serverId: 7,
        })
        await assert.rejects(
            () => provider.authenticate({ token: 'zone-9-token', sId: 9, ip: '', reconnect: false }),
            (error: unknown) => {
                assert.ok(error instanceof LobbyAuthRejection)
                assert.equal(error.code, 'AUTH_REQUIRED')
                return true
            },
        )
        // 他区票据绝不能回源：回源会拿到「合法」结果，于是把别的区服建连到本进程。
        assert.deepEqual(calls, [])
        const identity = await provider.authenticate({ token: 'zone-7-token', sId: 7, ip: '', reconnect: false })
        assert.equal(identity.sId, 7)
        assert.deepEqual(calls, ['zone-7-token:7'])
        // 固定区服缺省就是 fail-open，必须在构造期就拒绝。
        assert.throws(
            () =>
                new NativeLobbyAuthProvider({
                    verifier: {} as never,
                    identities: { resolve: async () => 1 },
                    serverId: 0,
                }),
            /fixed server id/,
        )
    })
})

function routeRegistryOptions() {
    const codec = new NativeLobbyContractCodec()
    return { validateResponse: (route: string, response: unknown) => codec.validateResponse(route, response) }
}

function context() {
    return { uid: 'external-9007199254740993', sId: 7, sessionEpoch: 'e1', connectionId: 'c1', ip: '127.0.0.1' }
}
