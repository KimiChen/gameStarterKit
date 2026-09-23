'use strict'
const assert = require('node:assert/strict')
const path = require('node:path')
module.exports = async function verifyBoss({ h, clients, serverRoot, restart }) {
    const { GameDemoRpc } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemo'))
    const { GameDemoBossRpc, GameDemoBossPush } = require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains/gameDemoBoss'))
    let sequence = 0
    const request = async (client, route, payload = {}) => {
        const id = `boss-live-${sequence++}`
        client.send(h.rpc(id, route, payload))
        const [frame] = await client.collect(value => value.kind === 'reply' && value.reply.id === id, 1)
        return frame.reply
    }
    const readyRoom = async (client, bossId) => {
        for (let attempt = 0; attempt < 40; attempt++) {
            const reply = await request(client, GameDemoBossRpc.Get, { bossId })
            if (reply.ok) return reply.data
            assert.equal(reply.err.code, 'GAME_DEMO_BOSS_RECOVERING', JSON.stringify(reply))
            await new Promise(resolve => setTimeout(resolve, 250))
        }
        throw new Error(`room recovery timed out: ${bossId}`)
    }
    const actors = []
    for (const bossId of ['tiger', 'dragon', 'phoenix']) {
        const uid = `boss-${bossId}-${h.RUN_ID}`
        const client = await h.makeConnector(clients)(uid, uid)
        assert.equal((await request(client, GameDemoRpc.Initialize, { clientReqId: 'initialize' })).ok, true)
        await readyRoom(client, bossId)
        const joined = await request(client, GameDemoBossRpc.Enter, { clientReqId: 'enter', bossId })
        assert.equal(joined.ok, true, JSON.stringify(joined))
        const payload = { clientReqId: 'hit', bossId, runId: joined.data.room.runId, generation: joined.data.generation }
        const hit = await request(client, GameDemoBossRpc.Attack, payload)
        assert.equal(hit.ok, true, JSON.stringify(hit))
        assert.equal(hit.data.room.hp, joined.data.room.hp - 10)
        assert.equal(hit.data.myDamage, 10)
        assert.deepEqual((await request(client, GameDemoBossRpc.Attack, payload)).data, hit.data)
        actors.push({ uid, client, bossId, payload, hit: hit.data })
    }
    const listing = await request(actors[0].client, GameDemoBossRpc.List)
    assert.equal(listing.ok, true)
    assert.equal(listing.data.rooms.length, 3)
    for (const actor of actors) {
        const record = JSON.parse(h.redis('hget', 'kt:gameDemo:boss-runs:v1', JSON.stringify([h.SID, actor.bossId, actor.hit.room.runNumber])))
        assert.equal(record.hp, actor.hit.room.hp)
        assert.equal(record.damage.find(d => d.uid === actor.uid).damage, 10)
    }
    await restart()
    for (const actor of actors) {
        actor.client = await h.makeConnector(clients)(`reconnect-${actor.uid}`, actor.uid, h.SID, true)
        const recovered = await readyRoom(actor.client, actor.bossId)
        assert.equal(recovered.room.runId, actor.hit.room.runId)
        assert.equal(recovered.room.hp, actor.hit.room.hp)
        assert.deepEqual(recovered.room.damage, actor.hit.room.damage)
        assert.equal(recovered.room.phase, actor.hit.room.phase)
        assert.ok(recovered.room.ownerEpoch > actor.hit.room.ownerEpoch)
        assert.deepEqual((await request(actor.client, GameDemoBossRpc.Attack, actor.payload)).data, actor.hit)
        const continued = await request(actor.client, GameDemoBossRpc.Attack, { ...actor.payload, clientReqId: 'continued' })
        assert.equal(continued.ok, true, JSON.stringify(continued))
        assert.equal(continued.data.room.hp, recovered.room.hp - 10)
        assert.equal(continued.data.myDamage, 20)
        const [changed] = await actor.client.collect(h.isPushOf(GameDemoBossPush.Changed), 1)
        assert.equal(changed.push.data.bossId, actor.bossId)
        assert.equal(changed.push.data.runId, actor.hit.room.runId)
        assert.equal(changed.push.data.generation, actor.payload.generation)
    }
    const a = actors[0]
    const switched = await request(a.client, GameDemoBossRpc.Enter, { clientReqId: 'switch', bossId: 'dragon' })
    assert.equal(switched.ok, true)
    assert.ok(switched.data.generation > a.payload.generation)
    const late = await request(a.client, GameDemoBossRpc.Attack, { ...a.payload, clientReqId: 'late-old-room' })
    assert.equal(late.ok, false)
    assert.equal(late.err.code, 'GAME_DEMO_BOSS_STALE')
    const selection = await request(a.client, GameDemoBossRpc.List)
    assert.equal(selection.data.currentBossId, 'dragon')
    console.log(JSON.stringify({ bossRecovery: true, rooms: actors.map(a => a.hit.room.runId), checks: ['three-independent-rooms', 'kill-and-recover-same-run-health-damage-phase', 'new-ownership-epoch', 'old-hit-replay', 'continue-attacking', 'typed-room-push', 'stale-selection-rejected'] }))
}
