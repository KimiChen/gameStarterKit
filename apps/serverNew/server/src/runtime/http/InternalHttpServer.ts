import http from 'node:http'

const BODY_LIMIT = 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000

export class InternalHttpServer {
    private server?: http.Server

    constructor(
        private readonly options: {
            host: string
            port: number
            secret: string
            health: () => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
            action: (payload: any, remoteAddress?: string) => Promise<unknown>
        },
    ) {
        if (!options.secret) {
            throw new Error('gmSecret 为空，拒绝启动内部 HTTP listener')
        }
    }

    async start() {
        if (this.server) throw new Error('internal HTTP server already started')
        this.server = http.createServer((req, res) => {
            req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('internal request timeout')))
            this.handle(req, res).catch((error) => {
                if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ code: -1, message: error instanceof Error ? error.message : String(error) }))
            })
        })
        await new Promise<void>((resolve, reject) => {
            const onError = (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    reject(
                        new Error(
                            `内部端口 ${this.options.host}:${this.options.port} 已被占用；请在 s${SERVER_ID}.json5 显式配置 internalPort`,
                        ),
                    )
                    return
                }
                reject(error)
            }
            this.server!.once('error', onError)
            this.server!.listen(this.options.port, this.options.host, () => {
                this.server!.off('error', onError)
                resolve()
            })
        })
    }

    async stop() {
        const server = this.server
        this.server = undefined
        if (!server) return
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }

    private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        if (req.method === 'GET' && req.url === '/health') {
            const health = await this.options.health()
            res.writeHead(health.status)
            res.end(JSON.stringify(health.body))
            return
        }
        if (req.method !== 'POST' || req.url !== '/internal/action') {
            res.writeHead(404)
            res.end(JSON.stringify({ code: -1, message: 'not found' }))
            return
        }
        if (req.headers['x-internal-secret'] !== this.options.secret) {
            res.writeHead(401)
            res.end(JSON.stringify({ code: -1, message: 'unauthorized' }))
            return
        }
        const contentType = String(req.headers['content-type'] ?? '')
            .split(';', 1)[0]!
            .trim()
            .toLowerCase()
        if (contentType !== 'application/json') {
            res.writeHead(415)
            res.end(JSON.stringify({ code: -1, message: 'application/json required' }))
            return
        }
        const chunks: Buffer[] = []
        let length = 0
        for await (const chunk of req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            length += buffer.length
            if (length > BODY_LIMIT) {
                res.writeHead(413)
                res.end(JSON.stringify({ code: -1, message: 'request too large' }))
                return
            }
            chunks.push(buffer)
        }
        try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const data = await this.options.action(payload, req.socket.remoteAddress)
            res.writeHead(200)
            res.end(JSON.stringify({ code: 0, message: 'success', data: { json: data } }))
        } catch (error) {
            res.writeHead(200)
            res.end(JSON.stringify({ code: -1, message: error instanceof Error ? error.message : String(error) }))
        }
    }
}
