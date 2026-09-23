const assert = require('node:assert/strict')
const { createHarness, freePort, assertPortFree } = require('../verify/lobbyLiveHarness.cjs')

async function main() {
    const absent = process.argv.includes('--absent')
    const nativePort = await freePort()
    const harness = createHarness({
        platform: 'bearjoy',
        platformVersion: 'live',
        sid: 1,
        centerRedisDb: 9,
        userRedisDb: 8,
        clientPort: 18090,
        internalPort: 28090,
        gmSecret: 'r7HpIaNXTMXaKw2',
        nativePort,
        launchMode: 'single',
    })
    await assertPortFree(harness.INTERNAL_PORT, 'internal HTTP')
    await harness.platform.start()
    const server = harness.startServer({
        PROJECT_ID: harness.PROJECT_ID,
        NATIVE_LOBBY_HOST: '127.0.0.1',
        NATIVE_LOBBY_PORT: String(nativePort),
        WEBPLATFORM_INTERNAL_ORIGIN: harness.platform.origin,
        WEBPLATFORM_SERVICE_ID: 'game-live-check',
        WEBPLATFORM_SERVICE_SECRET: `live-secret-${harness.RUN_ID}`,
        ALLOY_MULTI_PROCESS_ENABLED: '0',
    })
    const clients = []
    try {
        const ready = await harness.waitUntilReady(120000, server)
        ready.close()
        const connect = harness.makeConnector(clients)
        const client = await connect(`kit-${harness.RUN_ID}`, `kit-user-${harness.RUN_ID}`)
        client.send(harness.rpc('kit-ping', 'gameDemo.ping', {}))
        const reply = await client.next()
        assert.equal(reply.kind, 'reply')
        assert.equal(reply.reply.id, 'kit-ping')
        if (absent) assert.equal(reply.reply.ok, false)
        else {
            assert.equal(reply.reply.ok, true)
            assert.deepEqual(reply.reply.data, { message: 'pong' })
        }
        console.log(`[kit] real process ${absent ? 'rejects removed' : 'serves installed'} gameDemo.ping`)
    } finally {
        for (const client of clients) client.close()
        const exited = new Promise((resolve) => server.child.once('exit', resolve))
        server.child.kill('SIGTERM')
        if (
            (await Promise.race([
                exited.then(() => true),
                new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
            ])) === false
        ) {
            server.child.kill('SIGKILL')
        }
        server.stream.end()
        await harness.platform.stop()
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
