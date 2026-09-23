'use strict'

// P0: 真实原生宿主 + WebSocket 状态查询；身份平台使用宿主现有本地桩。
const path = require('node:path')
const assert = require('node:assert/strict')
const serverRoot = path.resolve(__dirname, '../../../server')
const { createHarness, freePort, assertPortFree } = require(path.join(serverRoot, 'scripts/verify/lobbyLiveHarness.cjs'))
const { GameDemoRpc, validateGameDemoStatusRes, validateGameDemoAssetsRes } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemo'))
const { GameDemoAlchemyRpc } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemoAlchemy'))
const { GameDemoHeroRpc } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemoHero'))
const { GameDemoSeasonRpc } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemoSeason'))
const { GameDemoGuildRpc } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemoGuild'))
const testBoss = process.argv.includes('--boss')
const testGuild = process.argv.includes('--guild')
const testNatural = process.argv.includes('--natural')
const testSeason = process.argv.includes('--season') || testNatural
const testProduction = process.argv.includes('--production') || testSeason
const testRestart = process.argv.includes('--restart')
const testAssets = process.argv.includes('--assets') || testProduction || testGuild || testBoss

async function main() {
    const h = createHarness({
        platform: 'bearjoy', platformVersion: 'live', sid: 1,
        centerRedisDb: 9, userRedisDb: 8, clientPort: 18090, internalPort: 28090,
        gmSecret: 'r7HpIaNXTMXaKw2', nativePort: await freePort(), launchMode: 'single',
    })
    await assertPortFree(h.INTERNAL_PORT, 'gameDemo 内网 HTTP')
    await assertPortFree(h.CLIENT_PORT, 'gameDemo 宿主客户端端口')
    const clients = []
    let server
    try {
        await h.platform.start()
        const serverEnvironment = {
            PROJECT_ID: h.PROJECT_ID,
            NATIVE_LOBBY_HOST: '127.0.0.1', NATIVE_LOBBY_PORT: String(h.NATIVE_PORT),
            WEBPLATFORM_INTERNAL_ORIGIN: h.platform.origin,
            WEBPLATFORM_SERVICE_ID: 'game-live-check', WEBPLATFORM_SERVICE_SECRET: `live-secret-${h.RUN_ID}`,
            ALLOY_MULTI_PROCESS_ENABLED: '0', CODEBUDDY_SAFE_DELETE_ENABLED: '0',
            GAME_DEMO_DEV_TOOLS: testAssets ? '1' : '0',
        }
        server = h.startServer(serverEnvironment)
        const ready = await h.waitUntilReady(90000, server)
        ready.close()
        let client = await h.makeConnector(clients)(`gameDemo-${h.RUN_ID}`, `gameDemo-${h.RUN_ID}`)
        client.send(h.rpc('gameDemo-status', GameDemoRpc.Status))
        const [frame] = await client.collect(value => value.kind === 'reply' && value.reply.id === 'gameDemo-status', 1)
        assert.equal(frame.reply.ok, true)
        assert.deepEqual(validateGameDemoStatusRes(frame.reply.data), { kit: 'gameDemo', runtime: 'serverNew', stage: 'P0' })
        const request = async (id, route, payload = {}) => {
            client.send(h.rpc(id, route, payload))
            const [reply] = await client.collect(value => value.kind === 'reply' && value.reply.id === id, 1)
            return reply.reply
        }
        if (testAssets) {
            const before = await request('assets-before', GameDemoRpc.Assets)
            assert.equal(before.ok, true)
            assert.equal(validateGameDemoAssetsRes(before.data).initialized, false)
            const first = await request('initialize-first', GameDemoRpc.Initialize, { clientReqId: 'initialize-first' })
            assert.equal(first.ok, true, JSON.stringify(first))
            assert.equal(validateGameDemoAssetsRes(first.data).gold, 5000)
            assert.equal(first.data.items.pill, 100)
            assert.equal(first.data.items.finePill, 100)
            assert.equal(first.sync.mods.gameDemoAssets.gold, 5000)
            assert.equal(first.sync.mods.versions.gameDemoAssets, 3)
            const duplicate = await request('initialize-retry', GameDemoRpc.Initialize, { clientReqId: 'initialize-first' })
            assert.deepEqual(duplicate.data, first.data)
            const again = await request('initialize-new-id', GameDemoRpc.Initialize, { clientReqId: 'initialize-second' })
            assert.equal(again.ok, true)
            assert.equal(again.data.gold, 5000)
            const after = await request('assets-after', GameDemoRpc.Assets)
            assert.equal(after.data.gold, 5000)
            assert.equal(h.redis('hget', 'nativeLobby:shop:balance:v1', `1:gameDemo-${h.RUN_ID}`), '5000')
            const bought = await request('buy-herb', GameDemoRpc.Buy, { clientReqId: 'buy-herb', product: 'herb', count: 10 })
            assert.equal(bought.ok, true, JSON.stringify(bought))
            assert.equal(bought.data.gold, 4900)
            assert.equal(bought.data.items.herb, 10)
            const retryBuy = await request('buy-herb-retry', GameDemoRpc.Buy, { clientReqId: 'buy-herb', product: 'herb', count: 10 })
            assert.deepEqual(retryBuy.data, bought.data)
            const shop = await request('shop-query', GameDemoRpc.Shop)
            assert.equal(shop.ok, true)
            assert.equal(shop.data.purchased.herb, 10)
            assert.equal(h.redis('hget', 'nativeLobby:grants:items:v1', `1:gameDemo-${h.RUN_ID}:900001`), '10')
            const inbox = await request('mail-list', GameDemoRpc.MailList)
            assert.equal(inbox.ok, true)
            assert.equal(inbox.data.mails.length, 1)
            const mailId = inbox.data.mails[0].id
            const read = await request('mail-read', GameDemoRpc.MailRead, { clientReqId: 'mail-read', mailId })
            assert.equal(read.ok, true)
            assert.equal(read.data.mails[0].read, true)
            const claim = await request('mail-claim', GameDemoRpc.MailClaim, { clientReqId: 'mail-claim', mailId })
            assert.equal(claim.ok, true, JSON.stringify(claim))
            assert.equal(claim.data.assets.gold, 5000)
            assert.equal(claim.sync.mods.gameDemoMail.mails[0].claimed, true)
            const claimAgain = await request('mail-claim-again', GameDemoRpc.MailClaim, { clientReqId: 'mail-claim-again', mailId })
            assert.equal(claimAgain.ok, true)
            assert.equal(claimAgain.data.assets.gold, 5000)
            if (testProduction) {
                if (testSeason) {
                    let current
                    for (let i = 0; i < 150; i++) {
                        current = await request(`season-before-${i}`, GameDemoSeasonRpc.Get)
                        assert.equal(current.ok, true)
                        if (current.data.phase === 'running' && current.data.endsAt - current.data.serverNow > 30000) break
                        await new Promise(resolve => setTimeout(resolve, 300))
                    }
                    assert.equal(current.data.phase, 'running')
                    assert.equal(current.data.endsAt - current.data.startedAt, 600000)
                }
                const dew = await request('buy-dew', GameDemoRpc.Buy, { clientReqId: 'buy-dew', product: 'dew', count: 2 })
                assert.equal(dew.ok, true)
                const start = await request('alchemy-start', GameDemoAlchemyRpc.Start, { clientReqId: 'alchemy-start', count: 2 })
                assert.equal(start.ok, true, JSON.stringify(start))
                assert.equal(start.data.batch.phase, 'claimed')
                assert.equal(start.data.batch.durationMs, 0)
                assert.equal(start.data.assets.items.pill + start.data.assets.items.finePill, 202)
                const batch = start.data.batch
                const field = JSON.stringify([1, `gameDemo-${h.RUN_ID}`, batch.id])
                const stored = h.redis('hget', 'kt:gameDemo:alchemy-batches:v1', field)
                if (testRestart) {
                    const oldPid = server.child.pid
                    const killed = new Promise(resolve => server.child.once('exit', resolve))
                    server.child.kill('SIGKILL')
                    await killed
                    server.stream.end()
                    server = h.startServer(serverEnvironment)
                    const restartedReady = await h.waitUntilReady(90000, server)
                    restartedReady.close()
                    assert.notEqual(server.child.pid, oldPid)
                    client = await h.makeConnector(clients)(`gameDemo-reconnect-${h.RUN_ID}`, `gameDemo-${h.RUN_ID}`, 1, true)
                    const resumed = await request('alchemy-resumed', GameDemoAlchemyRpc.Get)
                    assert.equal(resumed.ok, true)
                    assert.equal(resumed.data.batch.id, batch.id)
                    assert.equal(resumed.data.batch.endsAt, batch.endsAt)
                    assert.equal(h.redis('hget', 'kt:gameDemo:alchemy-batches:v1', field), stored)
                }
                // Legacy finish remains an idempotent read of already-settled v4 production.
                const finishPayload = { clientReqId: 'alchemy-finish', batchId: batch.id, early: false }
                const finish = await request('alchemy-finish', GameDemoAlchemyRpc.Finish, finishPayload)
                assert.equal(finish.ok, true, JSON.stringify(finish))
                assert.equal(finish.data.batch.pill + finish.data.batch.finePill, 2)
                const finishAgain = await request('alchemy-finish-again', GameDemoAlchemyRpc.Finish, finishPayload)
                assert.deepEqual(finishAgain.data, finish.data)
                const upgradePayload = { clientReqId: 'hero-upgrade', pill: finish.data.assets.items.finePill > 0 ? 'fine' : 'normal', count: 10 }
                const hero = await request('hero-upgrade', GameDemoHeroRpc.Upgrade, upgradePayload)
                assert.equal(hero.ok, true, JSON.stringify(hero))
                assert.ok(hero.data.hero.level >= 2)
                assert.ok(hero.data.hero.attack > 10)
                assert.equal(hero.sync.mods.gameDemoHero.revision, hero.data.hero.revision)
                const heroAgain = await request('hero-upgrade-again', GameDemoHeroRpc.Upgrade, upgradePayload)
                assert.deepEqual(heroAgain.data, hero.data)
                if (testSeason) {
                    let ranked
                    for (let attempt = 0; attempt < 10; attempt++) {
                        ranked = await request(`season-score-${attempt}`, GameDemoSeasonRpc.Get)
                        if (ranked.ok && ranked.data.myScore === finish.data.batch.score) break
                        await new Promise(resolve => setTimeout(resolve, 300))
                    }
                    assert.equal(ranked.data.myScore, finish.data.batch.score)
                    assert.ok(ranked.data.myRank >= 1 && ranked.data.myRank <= 3)
                    const endPayload = { clientReqId: 'season-end', seasonId: ranked.data.id }
                    const ended = testNatural ? null : await request('season-end', GameDemoSeasonRpc.End, endPayload)
                    if (ended) {
                        assert.equal(ended.ok, true, JSON.stringify(ended))
                        assert.equal(ended.data.phase, 'settling')
                    } else console.log(JSON.stringify({ waitingForNaturalEnd: ranked.data.id, endsAt: ranked.data.endsAt }))
                    const seasonField = JSON.stringify([1, Number(ranked.data.id.split(':')[1])])
                    client.close()
                    if (testRestart) {
                        const killed = new Promise(resolve => server.child.once('exit', resolve))
                        server.child.kill('SIGKILL')
                        await killed
                        server.stream.end()
                        server = h.startServer(serverEnvironment)
                        const readyAfterSettlement = await h.waitUntilReady(90000, server)
                        readyAfterSettlement.close()
                    }
                    let storedSeason
                    for (let attempt = 0; attempt < (testNatural ? 2200 : 30); attempt++) {
                        storedSeason = JSON.parse(h.redis('hget', 'kt:gameDemo:seasons:v1', seasonField))
                        if (storedSeason.phase === 'settled') break
                        await new Promise(resolve => setTimeout(resolve, 300))
                    }
                    assert.equal(storedSeason.phase, 'settled')
                    // Settlement completed while the player had no websocket connection.
                    client = await h.makeConnector(clients)(`season-reconnect-${h.RUN_ID}`, `gameDemo-${h.RUN_ID}`, 1, true)
                    const rewardMails = await request('season-mails', GameDemoRpc.MailList)
                    const rewards = rewardMails.data.mails.filter(mail => mail.title.startsWith('炼丹榜'))
                    assert.equal(rewards.length, 1)
                    const reward = rewards[0]
                    const rewardPayload = { clientReqId: 'season-claim', mailId: reward.id }
                    const received = await request('season-claim', GameDemoRpc.MailClaim, rewardPayload)
                    assert.equal(received.ok, true)
                    assert.equal(received.data.assets.gold, hero.data.assets.gold + reward.gold)
                    const replayed = await request('season-claim-replay', GameDemoRpc.MailClaim, rewardPayload)
                    assert.deepEqual(replayed.data, received.data)
                    if (ended) {
                        const endReplay = await request('season-end-replay', GameDemoSeasonRpc.End, endPayload)
                        assert.deepEqual(endReplay.data, ended.data)
                    }
                }
            }
            if (testGuild) {
                const ownerClient = client
                const targetUid = `guild-target-${h.RUN_ID}`
                const targetClient = await h.makeConnector(clients)(targetUid, targetUid)
                const ownerUid = `gameDemo-${h.RUN_ID}`
                client = targetClient
                assert.equal((await request('guild-target-init', GameDemoRpc.Initialize, { clientReqId: 'guild-target-init' })).ok, true)
                client = ownerClient
                const created = await request('guild-create', GameDemoGuildRpc.Create, { clientReqId: 'guild-create', name: '实测仙盟' })
                assert.equal(created.ok, true, JSON.stringify(created))
                assert.equal(created.data.guild.owner, ownerUid)
                const invite = await request('guild-invite', GameDemoGuildRpc.Invite, { clientReqId: 'guild-invite', targetUid })
                assert.equal(invite.ok, true, JSON.stringify(invite))
                client = targetClient
                const received = await request('guild-invitations', GameDemoGuildRpc.Get)
                assert.equal(received.data.invitations.length, 1)
                const acceptPayload = { clientReqId: 'guild-accept', inviteId: received.data.invitations[0].id, accept: true }
                const accepted = await request('guild-accept', GameDemoGuildRpc.Respond, acceptPayload)
                assert.equal(accepted.ok, true, JSON.stringify(accepted))
                assert.deepEqual(accepted.data.guild.members, [ownerUid, targetUid])
                assert.deepEqual((await request('guild-accept-replay', GameDemoGuildRpc.Respond, acceptPayload)).data, accepted.data)
                client = ownerClient
                const left = await request('guild-leave', GameDemoGuildRpc.Leave, { clientReqId: 'guild-leave' })
                assert.equal(left.ok, true)
                assert.equal(left.data.guild, null)
                client = targetClient
                assert.equal((await request('guild-transfer', GameDemoGuildRpc.Get)).data.guild.owner, targetUid)
                client = ownerClient
            }
        } else {
            const denied = await request('initialize-denied', GameDemoRpc.Initialize, { clientReqId: 'denied' })
            assert.equal(denied.ok, false)
            assert.equal(denied.err.code, 'GAME_DEMO_DEV_DISABLED')
        }
        if (testBoss) {
            await require('./boss-live.cjs')({ h, clients, serverRoot, restart: async () => {
                const priorPid = server.child.pid
                const killed = new Promise(resolve => server.child.once('exit', resolve))
                server.child.kill('SIGKILL'); await killed; server.stream.end()
                server = h.startServer(serverEnvironment)
                const readyAgain = await h.waitUntilReady(90000, server); readyAgain.close()
                assert.notEqual(server.child.pid, priorPid)
            } })
        }
        console.log(JSON.stringify({ ok: true, boss: testBoss, guild: testGuild, natural: testNatural, season: testSeason, production: testProduction, restart: testProduction && testRestart, checks: testAssets ? ['status', 'initialize-once', 'asset-sync', 'shop', 'purchase-replay', 'mail-read', 'mail-claim-once'] : ['status', 'development-gate'], run: h.RUN_ID, log: h.logPath }))
    } finally {
        for (const client of clients) client.close()
        if (server && server.child.exitCode === null && server.child.signalCode === null) {
            const exited = new Promise(resolve => server.child.once('exit', resolve))
            server.child.kill('SIGTERM')
            const timeout = setTimeout(() => server.child.kill('SIGKILL'), 10000)
            await exited
            clearTimeout(timeout)
            server.stream.end()
        }
        await h.platform.stop()
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
