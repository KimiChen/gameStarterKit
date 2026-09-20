const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { normalizeCompiledSourceMaps } = require('./normalizeCompiledSourceMaps')
const { stripCompiledSourceMaps } = require('./stripCompiledSourceMaps')
const { wireCompiledRuntime } = require('./wireCompiledRuntime')

const projectRoot = path.resolve(__dirname, '../..')
const log = fs.createWriteStream('/tmp/tsc-output.log', { flags: 'w' })
const child = childProcess.spawn(path.join(projectRoot, 'node_modules/.bin/tspc'), ['-w'], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
})

let compilerOutput = ''
let shutdownSignal
child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    log.write(chunk)
    compilerOutput += stripAnsi(chunk.toString())
    const marker = /Found \d+ errors?\. Watching for file changes\./g
    let match
    while ((match = marker.exec(compilerOutput)) !== null) {
        refreshCompiledRuntime()
        compilerOutput = compilerOutput.substring(match.index + match[0].length)
        marker.lastIndex = 0
    }
    if (compilerOutput.length > 8192) compilerOutput = compilerOutput.slice(-4096)
})

child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
    log.write(chunk)
})

child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
})

child.on('exit', (code, signal) => {
    log.end()
    process.exitCode = shutdownSignal || signal ? 0 : (code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        shutdownSignal = signal
        child.kill(signal)
    })
}

function refreshCompiledRuntime() {
    try {
        normalizeCompiledSourceMaps('build/compiled')
        stripCompiledSourceMaps('build/compiled')
        wireCompiledRuntime('build/compiled')
    } catch (error) {
        console.error(error)
        child.kill('SIGTERM')
        process.exitCode = 1
    }
}

function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/g, '')
}
