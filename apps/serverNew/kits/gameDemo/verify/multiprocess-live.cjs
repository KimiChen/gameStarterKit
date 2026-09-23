'use strict'

// Real host processes, Redis and wire replies. No fake worker, clock, HP or reward state.
const assert = require('node:assert/strict')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const serverRoot = path.resolve(__dirname, '../../../server')
const { createHarness, freePort, assertPortFree, childPidsOf, isAlive, getHealth, getProbe } = require(path.join(serverRoot, 'scripts/verify/lobbyLiveHarness.cjs'))
const contract = name => require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains', name))
const { GameDemoRpc } = contract('gameDemo')
const { GameDemoBossRpc, GameDemoBossPush } = contract('gameDemoBoss')
const { GameDemoGuildRpc } = contract('gameDemoGuild')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const bossIds = ['tiger', 'dragon', 'phoenix']
const traces = log => log.split('\n').flatMap(line => {
    const prefix = '[alloy-process-route] '
    const at = line.indexOf(prefix)
    return at < 0 ? [] : [JSON.parse(line.slice(at + prefix.length))]
})

async function main() {
    const h = createHarness({ platform: 'bearjoy', platformVersion: 'livemulti', sid: 1,
        centerRedisDb: 6, userRedisDb: 5, clientPort: 18095, internalPort: 28095,
        gmSecret: 'r7HpIaNXTMXaKw2', nativePort: await freePort(), launchMode: 'multi' })
    for (const port of [h.NATIVE_PORT, h.CLIENT_PORT, h.INTERNAL_PORT, 38095]) await assertPortFree(port, 'gameDemo multiprocess')
    let server, sequence = 0
    const clients = [], ownedPids = new Map(), timings = []
    const processStamp = pid => {
        try { return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' }).trim() }
        catch { return '' }
    }
    const rememberChild = pid => {
        const stamp = processStamp(pid)
        if (stamp) ownedPids.set(pid, stamp)
    }
    // A retained PID alone is not sufficient after a long test: the OS may reuse it.
    const ownedAlive = pid => isAlive(pid) && processStamp(pid) === ownedPids.get(pid)
    const poll = async (work, message, timeout = 90000) => {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) {
            assert.equal(server.child.exitCode, null, `master exited: ${server.tail.slice(-20).join('\n')}`)
            const result = await work()
            if (result) return result
            await delay(200)
        }
        throw new Error(message)
    }
    const health = async () => {
        try {
            const result = await getHealth(h.INTERNAL_PORT)
            for (const worker of result.body.workers ?? []) if (worker.pid && childPidsOf(server.child.pid).includes(worker.pid)) rememberChild(worker.pid)
            return result.body
        } catch { return null }
    }
    const request = async (client, route, payload = {}) => {
        const id = `multi-${sequence++}`
        const start = performance.now()
        client.send(h.rpc(id, route, payload))
        const [frame] = await client.collect(h.isReplyFor(id), 1, 15000)
        timings.push({ route, ms: performance.now() - start, ok: frame.reply.ok })
        return frame.reply
    }
    const success = async (...args) => {
        const reply = await request(...args)
        assert.equal(reply.ok, true, JSON.stringify(reply))
        return reply.data
    }
    const room = (client, bossId) => poll(async () => {
        const res = await request(client, GameDemoBossRpc.Get, { bossId })
        if (res.ok) return res.data
        assert.equal(res.err.code, 'GAME_DEMO_BOSS_RECOVERING', JSON.stringify(res))
    }, `room unavailable: ${bossId}`)
    try {
        await h.platform.start()
        server = h.startServer({ PROJECT_ID: h.PROJECT_ID,
            NATIVE_LOBBY_HOST: '127.0.0.1', NATIVE_LOBBY_PORT: String(h.NATIVE_PORT),
            WEBPLATFORM_INTERNAL_ORIGIN: h.platform.origin, WEBPLATFORM_SERVICE_ID: 'game-live-check',
            WEBPLATFORM_SERVICE_SECRET: `live-secret-${h.RUN_ID}`, ALLOY_MULTI_PROCESS_ENABLED: '1',
            ALLOY_PROCESS_ROUTE_TRACE: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(path.join(__dirname, 'event-loop-probe.cjs'))}`, CODEBUDDY_SAFE_DELETE_ENABLED: '0', GAME_DEMO_DEV_TOOLS: '1' })
        const pool = await poll(async () => { const v = await health(); return v?.ok ? v : null }, 'pool not ready')
        assert.equal(pool.workers.length, 5)
        assert.equal(new Set(pool.workers.map(w => w.pid)).size, 5)
        assert.deepEqual(pool.workers.map(w => w.role).sort(), ['TASK_WORKER', 'TASK_WORKER', 'USER_TASK_WORKER', 'USER_TASK_WORKER', 'WORKER'])
        const listener = pool.workers.find(w => w.role === 'WORKER')
        const actualListener = execFileSync('lsof', ['-nP', `-iTCP:${h.NATIVE_PORT}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim()
        assert.equal(actualListener, String(listener.pid))
        const ready = await h.waitUntilReady(90000, server); ready.close()
        console.log(JSON.stringify({ stage: 'pool-ready', run: h.RUN_ID, workers: pool.workers, log: h.logPath }))

        const actors = []
        for (let i = 0; i < 30; i++) {
            const uid = `gd-multi-${h.RUN_ID}-${i}`
            const client = await h.makeConnector(clients)(uid, uid)
            await success(client, GameDemoRpc.Initialize, { clientReqId: 'initialize' })
            actors.push({ uid, client, bossId: bossIds[i % 3] })
        }
        const baseline = {}
        for (const bossId of bossIds) {
            baseline[bossId] = (await room(actors[0].client, bossId)).room
            assert.equal(baseline[bossId].phase, 'running')
            assert.ok(baseline[bossId].hp > 200, 'fixture needs a live run with >200 HP')
        }
        const loadStartedAt = Date.now()
        const loadStart = performance.now()
        await Promise.all(actors.map(async a => {
            const entered = await success(a.client, GameDemoBossRpc.Enter, { clientReqId: 'enter', bossId: a.bossId })
            a.payload = { clientReqId: 'hit', bossId: a.bossId, runId: entered.room.runId, generation: entered.generation }
            a.hit = await success(a.client, GameDemoBossRpc.Attack, a.payload)
            assert.equal(a.hit.myDamage, 10)
            assert.deepEqual(await success(a.client, GameDemoBossRpc.Attack, a.payload), a.hit)
            const bought = await success(a.client, GameDemoRpc.Buy, { clientReqId: 'buy', product: 'herb', count: 2 })
            assert.equal(bought.gold, 4980)
            assert.equal(bought.items.herb, 2)
        }))
        // Ten paced rounds: 30 concurrent clients, two successful requests/client/round.
        // Query and replay exercise room queues + player routing without changing HP or stock again.
        for (let round = 0; round < 10; round++) {
            const roundStarted = performance.now()
            await Promise.all(actors.map(async a => {
                await success(a.client, GameDemoBossRpc.Get, { bossId: a.bossId })
                assert.equal((await success(a.client, GameDemoRpc.Buy, { clientReqId: 'buy', product: 'herb', count: 2 })).gold, 4980)
            }))
            await delay(Math.max(0, 1000 - (performance.now() - roundStarted)))
        }
        const loadDurationMs = performance.now() - loadStart
        const loadEndedAt = Date.now()
        const eventLoop = h.readLog().split('\n').flatMap(line => {
            const prefix = '[gameDemo-event-loop] '
            const at = line.indexOf(prefix)
            return at < 0 ? [] : [JSON.parse(line.slice(at + prefix.length))]
        }).filter(sample => sample.at >= loadStartedAt + 1000 && sample.at <= loadEndedAt)
        const workerEventLoop = pool.workers.map(w => {
            const samples = eventLoop.filter(s => s.pid === w.pid)
            assert.ok(samples.length > 0, `missing worker event-loop measurements: ${w.workerId}`)
            return { workerId: w.workerId, pid: w.pid, samples: samples.length,
                worstP95Ms: Math.round(Math.max(...samples.map(s => s.p95Ms))), maxMs: Math.round(Math.max(...samples.map(s => s.maxMs))) }
        })
        for (const bossId of bossIds) {
            const current = (await room(actors[0].client, bossId)).room
            assert.equal(current.hp, baseline[bossId].hp - 100)
            for (const a of actors.filter(a => a.bossId === bossId)) assert.equal(current.damage.find(d => d.uid === a.uid).damage, 10)
            baseline[bossId] = current
        }
        // Guild leader + three invitees race for only two available seats, across player workers.
        const [leader, ...candidates] = actors.slice(0, 4)
        await success(leader.client, GameDemoGuildRpc.Create, { clientReqId: 'create', name: '跨进程验收' })
        for (const a of candidates) {
            await success(leader.client, GameDemoGuildRpc.Invite, { clientReqId: `invite-${a.uid}`, targetUid: a.uid })
            a.invite = (await success(a.client, GameDemoGuildRpc.Get)).invitations[0]
        }
        const accepted = await Promise.all(candidates.map(a => request(a.client, GameDemoGuildRpc.Respond, { clientReqId: 'accept', inviteId: a.invite.id, accept: true })))
        assert.equal(accepted.filter(r => r.ok).length, 2)
        assert.equal(accepted.find(r => !r.ok).err.code, 'GAME_DEMO_GUILD_FULL')
        const guild = (await success(leader.client, GameDemoGuildRpc.Get)).guild
        assert.equal(guild.members.length, 3)
        for (let i = 0; i < candidates.length; i++) {
            const state = await success(candidates[i].client, GameDemoGuildRpc.Get)
            assert.equal(state.guild?.id ?? null, accepted[i].ok ? guild.id : null)
        }
        const beforeTraces = traces(h.readLog())
        for (const route of [GameDemoRpc.Initialize, GameDemoRpc.Buy, GameDemoGuildRpc.Respond]) {
            const executed = beforeTraces.filter(t => t.event === 'exec' && t.kind === 'routed-lobby-route' && t.route === route)
            assert.ok(executed.length > 0, `no receiver execution trace: ${route}`)
            for (const t of executed) assert.equal(t.pid, pool.workers.find(w => w.workerId === 1 + t.bindId % 2).pid)
            assert.equal(new Set(executed.map(t => t.pid)).size, 2, `both task workers must execute ${route}`)
        }
        for (const bossId of bossIds) {
            const a = actors.find(a => a.bossId === bossId)
            const [push] = await a.client.collect(f => h.isPushOf(GameDemoBossPush.Changed)(f) && f.push.data.bossId === bossId && f.push.data.revision >= baseline[bossId].revision, 1)
            assert.equal(push.push.data.runId, baseline[bossId].runId)
        }
        const before = pool.workers.find(w => w.workerId === 1)
        assert.ok(childPidsOf(server.child.pid).includes(before.pid))
        const killedAt = performance.now()
        process.kill(before.pid, 'SIGKILL')
        // The unaffected room must accept an attack while the other task worker recovers.
        const dragon = actors.find(a => a.bossId === 'dragon')
        const unaffected = await success(dragon.client, GameDemoBossRpc.Attack, { ...dragon.payload, clientReqId: 'during-recovery' })
        assert.equal(unaffected.room.hp, baseline.dragon.hp - 10)
        assert.equal(unaffected.room.ownerEpoch, baseline.dragon.ownerEpoch)
        assert.equal((await getProbe(38095, '/livez')).status, 200)
        const after = await poll(async () => {
            const p = await health()
            const w = p?.workers.find(w => w.workerId === before.workerId)
            return w?.pid && w.pid !== before.pid && w.generation === before.generation + 1 && ['READY', 'RUNNING'].includes(w.state) && isAlive(w.pid) ? w : null
        }, 'killed task worker not replaced')
        const currentListener = (await health()).workers.find(w => w.workerId === 0)
        assert.equal(currentListener.pid, listener.pid)
        assert.equal(currentListener.generation, listener.generation)
        for (const bossId of ['tiger', 'phoenix']) {
            const a = actors.find(a => a.bossId === bossId)
            const recovered = await room(a.client, bossId)
            assert.equal(recovered.room.runId, baseline[bossId].runId)
            assert.equal(recovered.room.hp, baseline[bossId].hp)
            assert.deepEqual(recovered.room.damage, baseline[bossId].damage)
            assert.equal(recovered.room.phase, baseline[bossId].phase)
            assert.ok(recovered.room.ownerEpoch > baseline[bossId].ownerEpoch)
            assert.deepEqual(await success(a.client, GameDemoBossRpc.Attack, a.payload), a.hit)
            const continued = await success(a.client, GameDemoBossRpc.Attack, { ...a.payload, clientReqId: 'continued' })
            assert.equal(continued.room.hp, recovered.room.hp - 10)
            const [push] = await a.client.collect(f => h.isPushOf(GameDemoBossPush.Changed)(f) && f.push.data.bossId === bossId && f.push.data.ownerEpoch === recovered.room.ownerEpoch, 1)
            assert.equal(push.push.data.generation, a.payload.generation)
        }
        const recoveryMs = performance.now() - killedAt
        if (process.argv.includes('--settlement')) {
            // Move the same 30 players into tiger and kill it using ordinary, cooldown-respecting attacks.
            await Promise.all(actors.map(async a => {
                const entered = await success(a.client, GameDemoBossRpc.Enter, { clientReqId: 'settlement-enter', bossId: 'tiger' })
                a.settlementPayload = { clientReqId: '', bossId: 'tiger', runId: entered.room.runId, generation: entered.generation }
            }))
            let dead
            for (let round = 0; round < 12; round++) {
                await delay(1050)
                const replies = await Promise.all(actors.map(a => request(a.client, GameDemoBossRpc.Attack, { ...a.settlementPayload, clientReqId: `death-${round}` })))
                for (const r of replies) if (!r.ok) assert.equal(r.err.code, 'GAME_DEMO_BOSS_ENDED', JSON.stringify(r))
                dead = replies.find(r => r.ok && r.data.room.hp === 0)?.data.room
                if (dead) break
            }
            assert.ok(dead, 'boss must be killed through real attacks')
            assert.equal(dead.damage.reduce((sum, d) => sum + d.damage, 0), dead.maxHp)
            const storedRun = () => JSON.parse(h.redis('hget', 'kt:gameDemo:boss-runs:v1', JSON.stringify([h.SID, 'tiger', dead.runNumber])))
            const partial = await poll(async () => {
                const r = storedRun()
                assert.notEqual(r.phase, 'settled', 'must interrupt a partially delivered settlement')
                return r.rewardCursor > 0 ? r : null
            }, 'no partial reward checkpoint observed', 10000)
            assert.ok(partial.rewardCursor < partial.damage.length)
            // Close reward recipients: settlement must continue without online players.
            for (const a of actors) a.client.close()
            const rewardWorker = (await health()).workers.find(w => w.workerId === 1)
            assert.ok(childPidsOf(server.child.pid).includes(rewardWorker.pid))
            process.kill(rewardWorker.pid, 'SIGKILL')
            const settled = await poll(async () => {
                const r = storedRun()
                assert.equal(r.runId, dead.runId)
                assert.equal(r.hp, 0)
                assert.equal(r.respawnAt, dead.respawnAt)
                return r.phase === 'settled' ? r : null
            }, 'offline reward settlement did not resume')
            assert.equal(settled.rewardCursor, dead.damage.length)
            assert.ok(settled.ownerEpoch > dead.ownerEpoch)
            for (const row of dead.damage) {
                const source = `boss:${dead.runId}:${row.uid}`
                const mailId = createHash('sha256').update(JSON.stringify([h.SID, row.uid, source])).digest('hex').slice(0, 32)
                const mail = JSON.parse(h.redis('hget', 'kt:gameDemo:mails:v1', JSON.stringify([h.SID, row.uid, mailId])))
                assert.equal(mail.gold, Math.max(1, Math.floor(settled.goldReward / row.rank)))
                const inbox = JSON.parse(h.redis('hget', 'kt:gameDemo:mailboxes:v1', `${h.SID}:${row.uid}`))
                assert.equal(inbox.ids.filter(id => id === mailId).length, 1)
            }
            const winner = actors[0]
            winner.client = await h.makeConnector(clients)(`reward-${winner.uid}`, winner.uid, h.SID, true)
            const mailbox = await success(winner.client, GameDemoRpc.MailList)
            const reward = mailbox.mails.find(m => m.title.startsWith('山君伤害榜'))
            assert.ok(reward)
            const beforeGold = (await success(winner.client, GameDemoRpc.Assets)).gold
            const claim = { clientReqId: 'boss-reward', mailId: reward.id }
            const claimed = await success(winner.client, GameDemoRpc.MailClaim, claim)
            assert.equal(claimed.assets.gold, beforeGold + reward.gold)
            assert.deepEqual(await success(winner.client, GameDemoRpc.MailClaim, claim), claimed)
            console.log(JSON.stringify({ stage: 'settlement-resumed', partialCursor: partial.rewardCursor, totalRewards: settled.rewardCursor, respawnAt: dead.respawnAt }))
            const newRun = await poll(async () => {
                const r = (await room(winner.client, 'tiger')).room
                if (r.runId === dead.runId) return null
                assert.ok(Date.now() >= dead.respawnAt)
                return r
            }, 'next run not opened at original deadline', 65000)
            assert.equal(newRun.runNumber, dead.runNumber + 1)
            assert.equal(newRun.hp, newRun.maxHp)
            assert.deepEqual(newRun.damage, [])
            const late = await request(winner.client, GameDemoBossRpc.Attack, { ...winner.settlementPayload, clientReqId: 'late-dead-run' })
            assert.equal(late.ok, false)
            assert.equal(late.err.code, 'GAME_DEMO_BOSS_STALE')
            console.log(JSON.stringify({ settlementRecovery: true, runId: dead.runId, nextRunId: newRun.runId, checks: ['real-death', 'partial-mail-checkpoint', 'sigkill-during-settlement', 'offline-resume', 'one-mail-per-damager', 'claim-once', 'original-respawn-deadline', 'reject-prior-run'] }))
        }
        const endTraces = traces(h.readLog())
        assert.ok(endTraces.some(t => t.event === 'exec' && t.route === GameDemoBossRpc.Attack && t.pid === after.pid))
        const sorted = timings.filter(t => t.ok).map(t => t.ms).sort((a,b) => a-b)
        console.log(JSON.stringify({ ok: true, run: h.RUN_ID, actors: actors.length, log: h.logPath,
            loadDurationMs: Math.round(loadDurationMs), pacedLoadRpcCount: 720, pacedLoadRpcPerSecond: Math.round(720000 / loadDurationMs), workerEventLoop, successfulRpcP50Ms: Math.round(sorted[Math.floor(sorted.length * .5)]),
            successfulRpcP95Ms: Math.round(sorted[Math.floor(sorted.length * .95)]), recoveryMs: Math.round(recoveryMs),
            requests: timings.length, rejected: timings.filter(t => !t.ok).length,
            oldWorker: before, newWorker: after,
            checks: ['real-five-worker-pool', 'player-routing-both-task-workers', '30-players-three-rooms', 'cross-worker-guild-capacity-race', 'task-worker-sigkill', 'other-room-keeps-playing', 'same-run-hp-damage-phase', 'replay-without-new-damage', 'continue-after-recovery', 'cross-process-push'] }))
    } finally {
        for (const client of clients) client.close()
        if (server) {
            for (const pid of childPidsOf(server.child.pid)) rememberChild(pid)
            if (server.child.exitCode === null && server.child.signalCode === null) {
                const exited = new Promise(resolve => server.child.once('exit', resolve))
                server.child.kill('SIGTERM')
                const timer = setTimeout(() => server.child.kill('SIGKILL'), 20000)
                await exited; clearTimeout(timer)
            }
            for (let i = 0; i < 50 && [...ownedPids.keys()].some(ownedAlive); i++) await delay(100)
            for (const pid of ownedPids.keys()) if (ownedAlive(pid)) process.kill(pid, 'SIGKILL')
            for (let i = 0; i < 50 && [...ownedPids.keys()].some(ownedAlive); i++) await delay(100)
            assert.equal([...ownedPids.keys()].some(ownedAlive), false, 'owned worker still alive after cleanup')
            server.stream.end()
        }
        await h.platform.stop()
    }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
