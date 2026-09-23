'use strict'

// Real process and Redis lifecycle: no shortened production clock, mocked HP, or direct business Redis writes.
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawn } = require('node:child_process')
const serverRoot = path.resolve(__dirname, '../../../server')
const { createHarness, freePort, assertPortFree } = require(path.join(serverRoot, 'scripts/verify/lobbyLiveHarness.cjs'))
const contract = name => require(path.join(serverRoot, 'generated/lobby-contract/native/lobbyRpc/domains', name))
const { GameDemoRpc } = contract('gameDemo')
const { GameDemoAlchemyRpc } = contract('gameDemoAlchemy')
const { GameDemoBossRpc } = contract('gameDemoBoss')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
    const h = createHarness({ platform: 'bearjoy', platformVersion: 'livemulti', sid: 1,
        centerRedisDb: 6, userRedisDb: 5, clientPort: 18095, internalPort: 28095,
        gmSecret: 'r7HpIaNXTMXaKw2', nativePort: await freePort(), launchMode: 'single' })
    for (const port of [h.NATIVE_PORT, h.CLIENT_PORT, h.INTERNAL_PORT]) await assertPortFree(port, 'gameDemo lifecycle')
    let server, sequence = 0
    const clients = []
    const lifecycle = async (operation, expected = 0, installer = false) => {
        const args = ['scripts/kit-lifecycle.cjs', '-p', 'bearjoy', '-v', 'livemulti', '--sid', '1', '--kit', 'gameDemo', '--operation', operation]
        if (installer) args.push('--data-version', '1', '--min-supported', '1')
        const child = spawn(process.execPath, args, { cwd: serverRoot, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout.on('data', chunk => { output += chunk })
        child.stderr.on('data', chunk => { output += chunk })
        const timer = setTimeout(() => child.kill('SIGKILL'), 210000)
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) }).finally(() => clearTimeout(timer))
        assert.equal(code, expected, `${operation}: ${output}`)
        return output
    }
    const stop = async () => {
        if (!server) return
        for (const client of clients.splice(0)) client.close()
        if (server.child.exitCode === null && server.child.signalCode === null) {
            const exited = new Promise(resolve => server.child.once('exit', resolve))
            server.child.kill('SIGTERM')
            const timer = setTimeout(() => server.child.kill('SIGKILL'), 20000)
            await exited; clearTimeout(timer)
        }
        server.stream.end()
        server = undefined
    }
    const start = async () => {
        server = h.startServer({ PROJECT_ID: h.PROJECT_ID, NATIVE_LOBBY_HOST: '127.0.0.1', NATIVE_LOBBY_PORT: String(h.NATIVE_PORT),
            WEBPLATFORM_INTERNAL_ORIGIN: h.platform.origin, WEBPLATFORM_SERVICE_ID: 'game-live-check',
            WEBPLATFORM_SERVICE_SECRET: `live-secret-${h.RUN_ID}`, ALLOY_MULTI_PROCESS_ENABLED: '0', CODEBUDDY_SAFE_DELETE_ENABLED: '0', GAME_DEMO_DEV_TOOLS: '1' })
        const ready = await h.waitUntilReady(90000, server); ready.close()
    }
    const request = async (client, route, payload = {}) => {
        const id = `life-${sequence++}`
        client.send(h.rpc(id, route, payload))
        const [frame] = await client.collect(h.isReplyFor(id), 1, 15000)
        return frame.reply
    }
    const success = async (...args) => {
        const result = await request(...args)
        assert.equal(result.ok, true, JSON.stringify(result))
        return result.data
    }
    try {
        await h.platform.start()
        await lifecycle('resume')
        await start()
        const uid = `gd-life-${h.RUN_ID}`
        let client = await h.makeConnector(clients)(uid, uid)
        await success(client, GameDemoRpc.Initialize, { clientReqId: 'init' })
        await success(client, GameDemoRpc.Buy, { clientReqId: 'herb', product: 'herb', count: 4 })
        await success(client, GameDemoRpc.Buy, { clientReqId: 'dew', product: 'dew', count: 2 })
        const entered = await success(client, GameDemoBossRpc.Enter, { clientReqId: 'enter', bossId: 'dragon' })
        const attack = { clientReqId: 'attack', bossId: 'dragon', runId: entered.room.runId, generation: entered.generation }
        const hit = await success(client, GameDemoBossRpc.Attack, attack)
        assert.equal(hit.myDamage, 10)
        const batch = await success(client, GameDemoAlchemyRpc.Start, { clientReqId: 'batch', count: 2 })
        const draining = lifecycle('drain')
        // CLI bootstrap needs a few seconds; wait for the actual shared barrier via a normal RPC.
        let blocked
        for (let i = 0; i < 40; i++) {
            blocked = await request(client, GameDemoRpc.Buy, { clientReqId: `during-drain-${i}`, product: 'herb', count: 1 })
            if (!blocked.ok) break
            await delay(250)
        }
        assert.equal(blocked.ok, false)
        assert.equal(blocked.err.code, 'IN_PROGRESS')
        const output = await draining
        assert.match(output, /"phase":"drained"/)
        assert.ok(Date.now() >= batch.batch.endsAt, 'drain must wait for real production completion')
        const produced = await success(client, GameDemoAlchemyRpc.Get)
        assert.equal(produced.batch.phase, 'claimed')
        assert.equal(produced.batch.pill + produced.batch.finePill, 2)
        const failedDetach = await lifecycle('detach', 1, true)
        assert.match(failedDetach, /stop all kit workers/)
        await stop()
        await lifecycle('detach', 0, true)
        await lifecycle('resume', 1)
        await lifecycle('attach', 0, true)
        await lifecycle('resume')
        await start()
        client = await h.makeConnector(clients)(`${uid}-again`, uid)
        const restored = await success(client, GameDemoBossRpc.Get, { bossId: 'dragon' })
        assert.equal(restored.room.runId, hit.room.runId)
        assert.equal(restored.room.hp, hit.room.hp)
        assert.deepEqual(restored.room.damage, hit.room.damage)
        assert.equal(restored.room.phase, hit.room.phase)
        const continued = await success(client, GameDemoBossRpc.Attack, { ...attack, clientReqId: 'continue' })
        assert.equal(continued.myDamage, 20)
        assert.equal(continued.room.hp, hit.room.hp - 10)
        const repeated = await success(client, GameDemoAlchemyRpc.Finish, { clientReqId: 'finish-after-resume', batchId: produced.batch.id, early: false })
        assert.deepEqual(repeated.assets, produced.assets)
        console.log(JSON.stringify({ ok: true, run: h.RUN_ID, log: h.logPath, checks: ['writes-fenced-while-online', 'timed-production-drained', 'online-detach-rejected', 'offline-detach-latched', 'explicit-resume', 'same-boss-run-hp-damage-phase', 'continue-original-run', 'no-duplicate-production'] }))
    } finally {
        await stop()
        await h.platform.stop()
    }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
