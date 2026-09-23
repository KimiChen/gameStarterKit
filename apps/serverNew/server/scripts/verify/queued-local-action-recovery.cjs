const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createClient } = require('redis')

const root = path.resolve(__dirname, '..', '..')
const storeSource = fs.readFileSync(path.join(root, 'src/runtime/action/QueuedLocalActionStore.ts'), 'utf8')
const leaseMs = 1200

function readScript(name) {
    const token = `const ${name} = \``
    const start = storeSource.indexOf(token)
    if (start < 0) throw new Error(`找不到生产脚本 ${name}`)
    const bodyStart = start + token.length
    const end = storeSource.indexOf('\n`', bodyStart)
    if (end < 0) throw new Error(`生产脚本 ${name} 未闭合`)
    return storeSource.slice(bodyStart, end)
}

const scripts = {
    enqueue: readScript('ENQUEUE_SCRIPT'),
    claim: readScript('CLAIM_SCRIPT'),
    ack: readScript('ACK_SCRIPT'),
}

function redisUrl() {
    if (process.env.ALLOY_QUEUE_VERIFY_REDIS_URL) return process.env.ALLOY_QUEUE_VERIFY_REDIS_URL
    const database = Number(process.env.ALLOY_QUEUE_VERIFY_REDIS_DB ?? 15)
    if (!Number.isInteger(database) || database < 0) throw new Error(`非法 Redis DB: ${database}`)
    return `redis://127.0.0.1:6379/${database}`
}

function queueKeys(prefix) {
    return {
        tasks: `${prefix}:tasks`,
        ready: `${prefix}:ready`,
        inflight: `${prefix}:inflight`,
        failed: `${prefix}:failed`,
        legacy: `${prefix}:legacy`,
    }
}

async function claim(client, keys, owner, readyNow, leaseNow) {
    return client.eval(scripts.claim, {
        keys: [keys.tasks, keys.ready, keys.inflight, keys.failed, keys.legacy],
        arguments: [
            String(readyNow),
            String(leaseNow),
            String(leaseNow + leaseMs),
            owner,
            '2',
            `legacy-${process.pid}`,
            `legacy-fingerprint-${process.pid}`,
            String(readyNow),
        ],
    })
}

async function childMain() {
    const prefix = process.env.ALLOY_QUEUE_VERIFY_PREFIX
    if (!prefix) throw new Error('缺少 ALLOY_QUEUE_VERIFY_PREFIX')
    const client = createClient({ url: redisUrl() })
    await client.connect()
    const readyNow = Math.floor(Date.now() / 1000)
    const raw = await claim(client, queueKeys(prefix), `old:${process.pid}`, readyNow, Date.now())
    if (typeof raw !== 'string') throw new Error('子进程没有认领到任务')
    const record = JSON.parse(raw)
    process.stdout.write(`CLAIMED ${record.taskId} ${record.attempts} ${record.leaseUntil}\n`)
    setInterval(() => undefined, 60_000)
}

function waitForClaim(child) {
    return new Promise((resolve, reject) => {
        let output = ''
        const timer = setTimeout(() => reject(new Error(`等待子进程认领超时\n${output}`)), 5000)
        child.stdout.on('data', (chunk) => {
            output += chunk.toString('utf8')
            const match = /CLAIMED\s+(\S+)\s+(\d+)\s+(\d+)/.exec(output)
            if (!match) return
            clearTimeout(timer)
            resolve({ taskId: match[1], attempts: Number(match[2]), leaseUntil: Number(match[3]) })
        })
        child.stderr.on('data', (chunk) => {
            output += chunk.toString('utf8')
        })
        child.once('exit', (code, signal) => {
            clearTimeout(timer)
            reject(new Error(`子进程在认领前退出 code=${code} signal=${signal}\n${output}`))
        })
    })
}

function waitExit(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => child.once('exit', resolve))
}

async function parentMain() {
    const prefix = `verify:queued-action:${process.pid}:${Date.now()}`
    const keys = queueKeys(prefix)
    const client = createClient({ url: redisUrl() })
    let child
    await client.connect()
    try {
        const now = Math.floor(Date.now() / 1000)
        const record = {
            version: 2,
            taskId: 'crash-recovery-task',
            fingerprint: 'crash-recovery-fingerprint',
            apiName: 'fixture/run',
            uId: 1,
            sId: 1,
            req: { marker: 'crash-recovery' },
            createdAt: now,
            availableAt: now,
            attempts: 0,
            state: 'pending',
        }
        const enqueued = await client.eval(scripts.enqueue, {
            keys: [keys.tasks, keys.ready],
            arguments: [record.taskId, record.fingerprint, JSON.stringify(record), String(now)],
        })
        assert.equal(enqueued[0], 'enqueued')

        child = spawn(process.execPath, [__filename, '--child'], {
            cwd: root,
            env: { ...process.env, ALLOY_QUEUE_VERIFY_PREFIX: prefix },
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        const first = await waitForClaim(child)
        assert.deepEqual([first.taskId, first.attempts], [record.taskId, 1])
        child.kill('SIGKILL')
        await waitExit(child)

        const waitMs = Math.max(0, first.leaseUntil - Date.now() + 50)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        const reclaimedRaw = await claim(client, keys, `new:${process.pid}`, Math.floor(Date.now() / 1000), Date.now())
        assert.equal(typeof reclaimedRaw, 'string')
        const reclaimed = JSON.parse(reclaimedRaw)
        assert.deepEqual([reclaimed.taskId, reclaimed.attempts], [record.taskId, 2])

        const acked = await client.eval(scripts.ack, {
            keys: [keys.tasks, keys.inflight],
            arguments: [record.taskId, `new:${process.pid}`, String(Math.floor(Date.now() / 1000))],
        })
        assert.equal(Number(acked), 1)
        const stored = JSON.parse(await client.hGet(keys.tasks, record.taskId))
        assert.deepEqual([stored.state, stored.attempts], ['done', 2])
        console.log('queued local action crash recovery passed')
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
            await waitExit(child)
        }
        await client.del(Object.values(keys))
        await client.quit()
    }
}

const main = process.argv.includes('--child') ? childMain : parentMain
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
