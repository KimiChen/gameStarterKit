const { spawn, execFileSync } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const WebSocket = require('ws')

const root = path.resolve(__dirname, '..', '..')
const sid = Number(process.env.ALLOY_BENCHMARK_SID || 2)
const clientPort = 20000 + sid
const internalPort = clientPort + 10000
const clientCount = Number(process.env.ALLOY_BENCHMARK_CLIENTS || 8)
const messagesPerClient = Number(process.env.ALLOY_BENCHMARK_MESSAGES || 500)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function getHealth() {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: internalPort, path: '/health' }, (response) => {
            const chunks = []
            response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }))
        }).once('error', reject)
    })
}

async function start(mode) {
    const child = spawn(
        process.execPath,
        ['deploy/dev/entrypoint.cjs', '-p', 'bearjoy', '-v', 'dev', '--sid', String(sid)],
        {
            cwd: root,
            env: { ...process.env, ALLOY_MULTI_PROCESS_ENABLED: mode === 'multi' ? '1' : '0' },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
        output += chunk
    })
    child.stderr.on('data', (chunk) => {
        output += chunk
    })
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`${mode} server exited early\n${output}`)
        try {
            const health = await getHealth()
            if (health.status === 200 && health.body.ok) return child
        } catch {}
        await delay(250)
    }
    child.kill('SIGKILL')
    throw new Error(`${mode} readiness timeout\n${output}`)
}

function connect() {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${clientPort}`)
        socket.once('open', () => resolve(socket))
        socket.once('error', reject)
    })
}

async function runClient(socket, latencies) {
    for (let index = 0; index < messagesPerClient; index += 1) {
        const started = process.hrtime.bigint()
        const response = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('heartbeat timeout')), 5000)
            socket.once('message', (data) => {
                clearTimeout(timer)
                if (!Buffer.from(data).equals(Buffer.from([0]))) reject(new Error('heartbeat mismatch'))
                else resolve()
            })
        })
        socket.send(Buffer.from([0]))
        await response
        latencies.push(Number(process.hrtime.bigint() - started) / 1e6)
    }
}

function cpu(pid) {
    try {
        return Number(execFileSync('ps', ['-p', String(pid), '-o', '%cpu='], { encoding: 'utf8' }).trim()) || 0
    } catch {
        return 0
    }
}

async function benchmark(mode) {
    const server = await start(mode)
    const sockets = await Promise.all(Array.from({ length: clientCount }, connect))
    const latencies = []
    const cpuSamples = []
    const cpuTimer = setInterval(() => cpuSamples.push(cpu(server.pid)), 250)
    const started = process.hrtime.bigint()
    await Promise.all(sockets.map((socket) => runClient(socket, latencies)))
    const seconds = Number(process.hrtime.bigint() - started) / 1e9
    clearInterval(cpuTimer)
    for (const socket of sockets) socket.close()
    server.kill('SIGINT')
    await new Promise((resolve) => server.once('exit', resolve))
    latencies.sort((a, b) => a - b)
    return {
        mode,
        messages: latencies.length,
        throughput: latencies.length / seconds,
        p99Ms: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.99))],
        masterCpuAverage: cpuSamples.length ? cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length : 0,
    }
}

async function main() {
    execFileSync('pnpm', ['build:runtime'], { cwd: root, stdio: 'inherit' })
    const single = await benchmark('single')
    const multi = await benchmark('multi')
    const result = { single, multi, multiToSingleThroughput: multi.throughput / single.throughput }
    console.log(JSON.stringify(result, null, 2))
    if (process.argv.includes('--enforce') && multi.throughput < single.throughput) process.exitCode = 1
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
