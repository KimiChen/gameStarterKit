import http from 'node:http'

export interface RuntimeProbeResult {
    readonly status: number
    readonly body: unknown
}

/**
 * 只读的进程存活/就绪探针。
 *
 * 它不能承载任何会落到 worker 的动作：多进程下由 master 持有，目的正是让监听 worker
 * 重拉期间仍有一个可观察出口。业务内部 HTTP 继续由监听 worker 承载。
 */
export class RuntimeProbeServer {
    private server?: http.Server

    constructor(
        private readonly options: {
            host: string
            port: number
            live: () => RuntimeProbeResult
            ready: () => RuntimeProbeResult
        },
    ) {}

    async start() {
        if (this.server) throw new Error('runtime probe server already started')
        this.server = http.createServer((req, res) => this.handle(req, res))
        await new Promise<void>((resolve, reject) => {
            const onError = (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    reject(
                        new Error(
                            `健康探针端口 ${this.options.host}:${this.options.port} 已被占用；` +
                                `请在 s${SERVER_ID}.json5 显式配置 healthPort`,
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

    /** 仅供启动自检与测试读取实际绑定地址；不暴露 HTTP 动作能力。 */
    address() {
        return this.server?.address() ?? null
    }

    private handle(req: http.IncomingMessage, res: http.ServerResponse) {
        const result =
            req.method === 'GET' && req.url === '/livez'
                ? this.options.live()
                : req.method === 'GET' && req.url === '/readyz'
                  ? this.options.ready()
                  : undefined
        res.setHeader('content-type', 'application/json; charset=utf-8')
        if (!result) {
            res.writeHead(404)
            res.end(JSON.stringify({ code: -1, message: 'not found' }))
            return
        }
        res.writeHead(result.status)
        res.end(JSON.stringify(result.body))
    }
}
