export interface PlatformMysqlConfig {
    host: string
    port?: int
    username: string
    password: string
    charset: string
    database: string
    logging?: boolean
}

export interface cdnInfo {
    baseUrl: string
    silentDownloadFlag?: number
    silentDownloadLimit?: number
}

export interface PlatformRedisConfig {
    host: string
    port: int
    secret?: string
    database?: number
}

export interface AdjustSsoConfig {
    readonly enabled: boolean
    readonly serverUrl?: string
    readonly loginPath?: string
    readonly isGameLine?: boolean
    readonly whiteOpen?: boolean
    readonly admins?: string[]
    readonly sessionTtlSeconds?: number
}

export interface AdjustQuickMenuConfig {
    readonly key?: string
    readonly name: string
    readonly url?: string
    readonly routeName?: string
    readonly target?: '_blank' | '_self'
    readonly appendContext?: boolean
}

export interface AdjustRedisConnectionConfig {
    readonly name?: string
    readonly enabled?: boolean
    readonly readOnly?: boolean
    readonly allowedDatabases?: number[]
}

export interface AdjustRedisConfig {
    readonly enabled: boolean
    readonly writeEnabled?: boolean
    readonly maxArgumentCount?: number
    readonly maxArgumentBytes?: number
    readonly maxResultBytes?: number
    readonly maxScanCount?: number
    readonly maxRangeItems?: number
    readonly connections?: { [key: string]: AdjustRedisConnectionConfig }
}

export interface AdjustAiCodeContextConfig {
    readonly enabled?: boolean
    readonly scopes?: { [key: string]: string }
    readonly denyDirs?: { [key: string]: string[] }
    readonly maxFileBytes?: number
    readonly maxGrepFiles?: number
}

export interface AdjustAiConfig {
    readonly enabled: boolean
    readonly promptWrite?: boolean
    readonly providerConfigWrite?: boolean
    readonly projectMemory?: boolean
    readonly experienceCases?: boolean
    readonly customSkills?: boolean
    readonly businessKnowledge?: boolean
    readonly logicKnowledge?: boolean
    readonly diffInfo?: boolean
    readonly gameConfig?: boolean
    readonly redis?: boolean
    readonly redisWrite?: boolean
    readonly customFunction?: boolean
    readonly mockClient?: boolean
    readonly codeContext?: AdjustAiCodeContextConfig
}

export interface FixedServerConfig {
    readonly clientHost: string
    readonly firstClientPort: number
    /** 内部 HTTP 监听地址，默认 0.0.0.0。 */
    readonly internalHost?: string
    /** 一区内部端口；未配置时在区服配置合并后按 clientPort + 10000 推导。 */
    readonly firstInternalPort?: number
    /** 一区独立存活/就绪探针端口；未配置时在区服配置合并后按 clientPort + 20000 推导。 */
    readonly firstHealthPort?: number
    readonly heartbeatTimeoutMs: number
    readonly authTimeoutMs: number
    readonly maxPacketSize: number
    /** Event Worker 数量。与 taskWorkerNum 同时为 0 时走单进程启动，不使用多进程运行时。 */
    readonly workerNum?: number
    /** Task Worker 数量。workerNum 为 0 时不允许大于 0。 */
    readonly taskWorkerNum?: number
    /** 专用业务 Task Worker 数量，默认 0。 */
    readonly userTaskWorkerNum?: number
}

export interface PlatformConfig {
    readonly centerRedis: PlatformRedisConfig
    readonly userRedis: PlatformRedisConfig
    readonly serverRedis: PlatformRedisConfig
    readonly log: any
    readonly centerMysql: PlatformMysqlConfig
    readonly whiteDeviceSwitch?: boolean
    readonly sessionSignKey: string
    readonly cdn: cdnInfo
    readonly host: string
    port: number
    //readonly ws: string
    readonly timeZone?: string
    //用于调试，在上线后要全部删掉，可通过CP.platform.debugPoints.xx判断要不要进入，默认为false
    readonly debugPoints: { [key: string]: boolean }
    // gm后台的ip白名单
    readonly gmApiWhiteIPList?: string[]
    // 支付回调白名单
    readonly payCallbackWhiteIPList?: string[]
    readonly gmSecret?: string
    // Allowed browser origins for the adjust web tool. Same-origin and local development origins are also accepted.
    readonly adjustOrigins?: string[]
    // Authentication and role policy for the adjust web tool.
    readonly adjustSso?: AdjustSsoConfig
    // Authenticated quick links shown by the adjust web tool.
    readonly adjustQuickMenus?: AdjustQuickMenuConfig[]
    // Server-side Redis debug policy. Connections not listed here are never exposed.
    readonly adjustRedis?: AdjustRedisConfig
    // Server-side AI assistant feature and tool policy.
    readonly adjustAi?: AdjustAiConfig
    /** 固定区服默认配置，区服端口按 firstClientPort + sid - 1 派生。 */
    readonly fixedServer?: FixedServerConfig
    readonly project: string
    // onOff配置,通用字典配置
    readonly onOffs: { [key: string]: string }
}

export interface ServiceConfig {
    readonly sid: number
    readonly clientHost: string
    readonly clientPort: number
    readonly internalHost: string
    readonly internalPort: number
    /** 主控进程承载的只读存活/就绪探针端口。 */
    readonly healthPort: number
    readonly heartbeatTimeoutMs: number
    readonly authTimeoutMs: number
    readonly maxPacketSize: number
    /** Event Worker 数量。0 表示单进程，见 taskWorkerNum。 */
    readonly workerNum: number
    /** Task Worker 数量。workerNum 与 taskWorkerNum 同时为 0 时才走单进程。 */
    readonly taskWorkerNum: number
    readonly userTaskWorkerNum: number
    readonly serverRedis?: Partial<PlatformRedisConfig>
}

export interface IPlatformConfigMap {
    readonly platform: PlatformConfig
    readonly service: ServiceConfig
}
