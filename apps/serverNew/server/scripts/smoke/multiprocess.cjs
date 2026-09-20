const { spawn, execFileSync } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const WebSocket = require('ws')

const root = path.resolve(__dirname, '..', '..')
const sid = Number(process.env.ALLOY_SMOKE_SID || 2)
const clientPort = 20000 + sid
const internalPort = clientPort + 10000

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function descendants(pid) {
    const result = []
    const queue = [pid]
    while (queue.length) {
        const parent = queue.shift()
        let children = []
        try {
            children = execFileSync('pgrep', ['-P', String(parent)], { encoding: 'utf8' })
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map(Number)
        } catch {}
        result.push(...children)
        queue.push(...children)
    }
    return result
}

function isAlive(pid) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

function getJson(port, pathname) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: pathname }, (response) => {
            const chunks = []
            response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            response.on('end', () =>
                resolve({
                    status: response.statusCode,
                    body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                }),
            )
        }).once('error', reject)
    })
}

function openHeartbeatSocket() {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${clientPort}`)
        const timer = setTimeout(() => reject(new Error('WebSocket heartbeat timeout')), 5000)
        socket.once('open', () => socket.send(Buffer.from([0])))
        socket.once('message', (data) => {
            clearTimeout(timer)
            if (!Buffer.from(data).equals(Buffer.from([0]))) reject(new Error('heartbeat payload mismatch'))
            else resolve(socket)
        })
        socket.once('error', reject)
    })
}

function startServer() {
    const child = spawn(
        process.execPath,
        ['deploy/dev/entrypoint.cjs', '-p', 'bearjoy', '-v', 'dev', '--sid', String(sid)],
        {
            cwd: root,
            env: { ...process.env, ALLOY_MULTI_PROCESS_ENABLED: '1' },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
        output += chunk
        process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
        output += chunk
        process.stderr.write(chunk)
    })
    return { child, output: () => output }
}

async function waitReady(server) {
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
        if (server.child.exitCode !== null) throw new Error(`server exited early\n${server.output()}`)
        try {
            const health = await getJson(internalPort, '/health')
            if (health.status === 200 && health.body.ok) return health.body
        } catch {}
        await delay(250)
    }
    throw new Error(`server readiness timeout\n${server.output()}`)
}

function waitExit(child, timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`process ${child.pid} exit timeout`)), timeoutMs)
        child.once('exit', () => {
            clearTimeout(timer)
            resolve()
        })
    })
}

async function assertGone(pids, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (pids.every((pid) => !isAlive(pid))) return
        await delay(100)
    }
    throw new Error(`orphan processes remain: ${pids.filter(isAlive).join(', ')}`)
}

async function gracefulScenario() {
    const server = startServer()
    const health = await waitReady(server)
    if (health.workers.length !== 4) throw new Error(`expected 4 workers, got ${health.workers.length}`)
    const childPids = descendants(server.child.pid)
    if (childPids.length !== 4) throw new Error(`expected 4 child processes, got ${childPids.length}`)
    const socket = await openHeartbeatSocket()
    const close = new Promise((resolve) => socket.once('close', (code) => resolve(code)))
    server.child.kill('SIGINT')
    const closeCode = await close
    if (closeCode !== 1001) throw new Error(`expected close code 1001, got ${closeCode}`)
    await waitExit(server.child, 15000)
    await assertGone(childPids, 3000)
}

async function killScenario() {
    const server = startServer()
    await waitReady(server)
    const childPids = descendants(server.child.pid)
    process.kill(server.child.pid, 'SIGKILL')
    await waitExit(server.child, 3000)
    await assertGone(childPids, 15000)
}

async function main() {
    execFileSync('pnpm', ['build:runtime'], { cwd: root, stdio: 'inherit' })
    await gracefulScenario()
    await killScenario()
    console.log('multiprocess smoke passed')
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
