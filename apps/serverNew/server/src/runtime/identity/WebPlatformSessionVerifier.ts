import http from 'node:http'
import https from 'node:https'
import { WebPlatformHttpContractMap } from '../../../generated/lobby-contract/protocol/http'
import type {
    RegisterCharacterResponse,
    VerifySessionResponse,
} from '../../../generated/lobby-contract/generated/webplatform'

/** 请求失败是基础设施错误；只有合法的 valid:false 响应才是玩家认证失败。 */
export class WebPlatformSessionVerifier {
    private readonly endpoint: URL
    private readonly agent: http.Agent | https.Agent

    constructor(
        private readonly options: {
            readonly origin: string
            readonly serviceId: string
            readonly serviceSecret: string
            readonly timeoutMs?: number
        },
    ) {
        const origin = new URL(options.origin)
        if (
            !['http:', 'https:'].includes(origin.protocol) ||
            origin.username ||
            origin.password ||
            origin.search ||
            origin.hash ||
            origin.pathname !== '/'
        )
            throw new Error('invalid WebPlatform origin')
        if (!options.serviceId || !options.serviceSecret) throw new Error('WebPlatform service credentials required')
        const timeout = options.timeoutMs ?? 5000
        if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('invalid WebPlatform timeout')
        this.endpoint = new URL(WebPlatformHttpContractMap.VerifySession.path, origin)
        this.agent =
            origin.protocol === 'https:' ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true })
    }

    verify(accessToken: string, serverId: number): Promise<VerifySessionResponse> {
        const contract = WebPlatformHttpContractMap.VerifySession
        const body = JSON.stringify(contract.request({ accessToken, serverId }))
        return new Promise((resolve, reject) => {
            let settled = false
            const finish = (error?: Error, value?: VerifySessionResponse) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                if (error) reject(error)
                else resolve(value!)
            }
            const request = (this.endpoint.protocol === 'https:' ? https : http).request(
                this.endpoint,
                {
                    method: contract.method,
                    agent: this.agent,
                    headers: {
                        'content-type': 'application/json',
                        'content-length': Buffer.byteLength(body),
                        'x-service-id': this.options.serviceId,
                        'x-service-secret': this.options.serviceSecret,
                    },
                },
                (response) => {
                    const chunks: Buffer[] = []
                    let length = 0
                    response.on('data', (chunk: Buffer) => {
                        length += chunk.length
                        if (length > 64 * 1024) {
                            finish(new Error('WebPlatform response too large'))
                            response.destroy()
                            request.destroy()
                            return
                        }
                        chunks.push(chunk)
                    })
                    response.on('error', () => finish(new Error('WebPlatform response failed')))
                    response.on('end', () => {
                        if (response.statusCode !== 200) {
                            finish(new Error(`WebPlatform service rejected verification (HTTP ${response.statusCode})`))
                            return
                        }
                        try {
                            finish(undefined, contract.response(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
                        } catch {
                            finish(new Error('WebPlatform response violates its contract'))
                        }
                    })
                },
            )
            const timer = setTimeout(() => {
                finish(new Error('WebPlatform verification timed out'))
                request.destroy()
            }, this.options.timeoutMs ?? 5000)
            request.on('error', () => finish(new Error('WebPlatform service unavailable')))
            request.end(body)
        })
    }

    async registerCharacter(userId: string, serverId: number): Promise<void> {
        if (!userId || userId.length > 128 || !Number.isSafeInteger(serverId) || serverId < 1) {
            throw new Error('invalid character registration identity')
        }
        const contract = WebPlatformHttpContractMap.RegisterCharacter
        contract.request({})
        const path = contract.path
            .replace('{userId}', encodeURIComponent(userId))
            .replace('{serverId}', String(serverId))
        await this.requestContract<RegisterCharacterResponse>(contract.method, path, undefined, contract.response)
    }

    private requestContract<T>(
        method: string,
        pathname: string,
        body: unknown,
        validate: (value: unknown) => T,
    ): Promise<T> {
        const endpoint = new URL(pathname, this.endpoint)
        const serialized = body === undefined ? undefined : JSON.stringify(body)
        return new Promise((resolve, reject) => {
            let settled = false
            const finish = (error?: Error, value?: T) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                if (error) reject(error)
                else resolve(value!)
            }
            const request = (endpoint.protocol === 'https:' ? https : http).request(
                endpoint,
                {
                    method,
                    agent: this.agent,
                    headers: {
                        ...(serialized === undefined
                            ? {}
                            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(serialized) }),
                        'x-service-id': this.options.serviceId,
                        'x-service-secret': this.options.serviceSecret,
                    },
                },
                (response) => {
                    const chunks: Buffer[] = []
                    let length = 0
                    response.on('data', (chunk: Buffer) => {
                        length += chunk.length
                        if (length > 64 * 1024) {
                            finish(new Error('WebPlatform response too large'))
                            response.destroy()
                            request.destroy()
                            return
                        }
                        chunks.push(chunk)
                    })
                    response.on('error', () => finish(new Error('WebPlatform response failed')))
                    response.on('end', () => {
                        if (response.statusCode !== 200)
                            return finish(
                                new Error(`WebPlatform service rejected request (HTTP ${response.statusCode})`),
                            )
                        try {
                            finish(undefined, validate(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
                        } catch {
                            finish(new Error('WebPlatform response violates its contract'))
                        }
                    })
                },
            )
            const timer = setTimeout(() => {
                finish(new Error('WebPlatform request timed out'))
                request.destroy()
            }, this.options.timeoutMs ?? 5000)
            request.on('error', () => finish(new Error('WebPlatform service unavailable')))
            request.end(serialized)
        })
    }

    close(): void {
        this.agent.destroy()
    }
}
