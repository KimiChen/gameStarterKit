'use strict'

// Loaded by the host's full-route contract suite. Keep kit cases inside the distributable package.
const assert = require('node:assert/strict')

module.exports = async function verifyGameDemoRoutes({ call, fails, redis, sid, contractRoot }) {
    const { GameDemoRpc } = require(require('node:path').join(contractRoot, 'native/lobbyRpc/domains/gameDemo'))
    const { GameDemoHeroRpc } = require(require('node:path').join(contractRoot, 'native/lobbyRpc/domains/gameDemoHero'))
    const { GameDemoAlchemyRpc } = require(require('node:path').join(contractRoot, 'native/lobbyRpc/domains/gameDemoAlchemy'))
    const previous = process.env.GAME_DEMO_DEV_TOOLS
    const { GameDemoSeasonRpc } = require(require('node:path').join(contractRoot, 'native/lobbyRpc/domains/gameDemoSeason'))
    const { GameDemoGuildRpc } = require(require('node:path').join(contractRoot, 'native/lobbyRpc/domains/gameDemoGuild'))
    const uid = 'contract-gameDemo'
    try {
        assert.deepEqual(await call(uid, GameDemoRpc.Status, {}), { kit: 'gameDemo', runtime: 'serverNew', stage: 'P0' })
        assert.equal((await call(uid, GameDemoRpc.Assets, {})).initialized, false)
        process.env.GAME_DEMO_DEV_TOOLS = '0'
        await fails(uid, GameDemoRpc.Initialize, { clientReqId: 'denied' }, 'GAME_DEMO_DEV_DISABLED')
        process.env.GAME_DEMO_DEV_TOOLS = '1'
        const first = await call(uid, GameDemoRpc.Initialize, { clientReqId: 'first' })
        assert.equal(first.gold, 5000)
        assert.equal(first.initialized, true)
        assert.deepEqual(await call(uid, GameDemoRpc.Initialize, { clientReqId: 'first' }), first)
        assert.equal((await call(uid, GameDemoRpc.Initialize, { clientReqId: 'second' })).gold, 5000)
        assert.equal(await redis.hGet('nativeLobby:shop:balance:v1', `${sid}:${uid}`), '5000')
        assert.equal((await call(uid, GameDemoRpc.Shop, {})).purchased.herb, 0)
        const bought = await call(uid, GameDemoRpc.Buy, { clientReqId: 'buy', product: 'herb', count: 10 })
        assert.equal(bought.gold, 4900)
        assert.equal(bought.items.herb, 10)
        assert.equal((await call(uid, GameDemoRpc.Shop, {})).purchased.herb, 10)
        await fails(uid, GameDemoRpc.Buy, { clientReqId: 'over-limit', product: 'herb', count: 100 }, 'GAME_DEMO_LIMIT')
        const inbox = await call(uid, GameDemoRpc.MailList, {})
        assert.equal(inbox.mails.length, 1)
        const mailId = inbox.mails[0].id
        assert.equal((await call(uid, GameDemoRpc.MailRead, { clientReqId: 'read', mailId })).mails[0].read, true)
        const claimed = await call(uid, GameDemoRpc.MailClaim, { clientReqId: 'claim', mailId })
        assert.equal(claimed.assets.gold, 5000)
        assert.equal(claimed.mailbox.mails[0].claimed, true)
        assert.deepEqual(await call(uid, GameDemoRpc.MailClaim, { clientReqId: 'claim', mailId }), claimed)
        await call(uid, GameDemoRpc.Buy, { clientReqId: 'dew', product: 'dew', count: 2 })
        assert.equal((await call(uid, GameDemoAlchemyRpc.Get, {})).batch, null)
        await call(uid, GameDemoSeasonRpc.Get, {})
        const started = await call(uid, GameDemoAlchemyRpc.Start, { clientReqId: 'start', count: 2 })
        assert.equal(started.batch.phase, 'claimed')
        assert.equal(started.batch.durationMs, 0)
        const finished = await call(uid, GameDemoAlchemyRpc.Finish, { clientReqId: 'finish', batchId: started.batch.id, early: false })
        assert.equal(finished.batch.pill + finished.batch.finePill, 2)
        const season = await call(uid, GameDemoSeasonRpc.Get, {})
        const ended = await call(uid, GameDemoSeasonRpc.End, { clientReqId: 'end-season', seasonId: season.id })
        assert.equal(ended.phase, 'settling')
        assert.equal((await call(uid, GameDemoHeroRpc.Get, {})).hero.level, 1)
        const upgraded = await call(uid, GameDemoHeroRpc.Upgrade, { clientReqId: 'upgrade', pill: finished.assets.items.finePill > 0 ? 'fine' : 'normal', count: 10 })
        assert.ok(upgraded.hero.level >= 2)
        const target = `${uid}-guild-target`
        await call(target, GameDemoRpc.Initialize, { clientReqId: 'init-target' })
        const createdGuild = await call(uid, GameDemoGuildRpc.Create, { clientReqId: 'create-guild', name: '测试仙盟' })
        assert.equal(createdGuild.guild.owner, uid)
        await call(uid, GameDemoGuildRpc.Invite, { clientReqId: 'invite-target', targetUid: target })
        const targetState = await call(target, GameDemoGuildRpc.Get, {})
        assert.equal(targetState.invitations.length, 1)
        const joined = await call(target, GameDemoGuildRpc.Respond, { clientReqId: 'accept-invite', inviteId: targetState.invitations[0].id, accept: true })
        assert.equal(joined.guild.id, createdGuild.guild.id)
        const left = await call(uid, GameDemoGuildRpc.Leave, { clientReqId: 'leave-guild' })
        assert.equal(left.guild, null)
        assert.equal((await call(target, GameDemoGuildRpc.Get, {})).guild.owner, target)
        const { GameDemoBossRpc } = require(require('node:path').join(contractRoot, 'native/lobbyRpc/domains/gameDemoBoss'))
        for (const bossId of ['tiger', 'dragon', 'phoenix']) await call(uid, GameDemoBossRpc.Get, { bossId })
        assert.equal((await call(uid, GameDemoBossRpc.List, {})).rooms.length, 3)
        const enteredBoss = await call(uid, GameDemoBossRpc.Enter, { clientReqId: 'boss-enter', bossId: 'tiger' })
        const hit = await call(uid, GameDemoBossRpc.Attack, { clientReqId: 'boss-hit', bossId: 'tiger', runId: enteredBoss.room.runId, generation: enteredBoss.generation })
        assert.equal(hit.room.hp, enteredBoss.room.maxHp - upgraded.hero.attack)
        const exitedBoss = await call(uid, GameDemoBossRpc.Leave, { clientReqId: 'boss-leave', bossId: 'tiger', generation: enteredBoss.generation })
        assert.equal(exitedBoss.currentBossId, null)
    } finally {
        if (previous === undefined) delete process.env.GAME_DEMO_DEV_TOOLS
        else process.env.GAME_DEMO_DEV_TOOLS = previous
    }
}
