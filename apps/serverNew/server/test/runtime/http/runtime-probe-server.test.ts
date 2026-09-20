import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { RuntimeProbeServer } from '../../../src/runtime/http/RuntimeProbeServer'

describe('runtime probe server', () => {
    it('keeps liveness independent from readiness and exposes no action endpoint', async () => {
        let ready = false
        const probe = new RuntimeProbeServer({
            host: '127.0.0.1',
            port: 0,
            live: () => ({ status: 200, body: { ok: true } }),
            ready: () => ({ status: ready ? 200 : 503, body: { ok: ready } }),
        })
        await probe.start()
        try {
            const port = (probe.address() as AddressInfo).port
            assert.deepEqual(await request(port, '/livez'), { status: 200, body: { ok: true } })
            assert.deepEqual(await request(port, '/readyz'), { status: 503, body: { ok: false } })
            ready = true
            assert.deepEqual(await request(port, '/readyz'), { status: 200, body: { ok: true } })
            assert.equal((await request(port, '/internal/action')).status, 404)
        } finally {
            await probe.stop()
        }
    })
})

function request(port: number, path: string): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path }, (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            response.on('end', () => {
                try {
                    resolve({
                        status: response.statusCode ?? 0,
                        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                    })
                } catch (error) {
                    reject(error)
                }
            })
        }).on('error', reject)
    })
}
