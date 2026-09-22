import fs from 'fs'
import path from 'path'
import { NativeLobbyPendingRoutes } from '../../src/runtime/lobby/NativeLobbyPendingRoutes'

export interface SchemaLobbyApi {
    readonly domain: string
    readonly name: string
    readonly route: string
    readonly serviceType: string
    readonly mode: 'query' | 'natural-write' | 'idempotent-write'
    readonly ownerModule: string
    /** wire 上的请求/响应类型名，即 schema 里 `request.ref` / `response.ref`。 */
    readonly requestType: string
    readonly responseType: string
    /**
     * 类型所在模块，相对 `domains/<domain>.ts` 解析。取值只来自 schema 的类型声明：
     *
     * - ref 在本域 `types` 里声明为对象/枚举 → `.`（域文件自身，生成物与 ref 同名导出）
     * - ref 是 `external` 声明 → 它的 `from`（与 `check.from` 同一套「相对声明文件」语义）
     */
    readonly requestTypeModule: string
    readonly responseTypeModule: string
    /**
     * 该路由归属另一条产品线（MMO），本项目只出 wire 元数据、不注册 Action。
     *
     * 真源是 `src/runtime/lobby/NativeLobbyPendingRoutes.ts`：启动期闸和生成器必须看同一份表，
     * 否则会出现「生成器给 pending 路由造 Action 骨架 → Actions 表里多一条本项目不拥有的路由」。
     */
    readonly pending: boolean
}

const DOMAIN_TYPE_MODULE = '.'

/** 域文件里 `types` 的一段声明：只需区分「本域声明」与 `external` 的落点。 */
type SchemaTypeDeclaration = { readonly kind?: unknown; readonly from?: unknown }

/**
 * 从 api 的 `request` / `response` 载荷里取 ref 名。
 *
 * ⛔ 不从 api 名拼 `I<name>Req` / `I<name>Res`：schema 允许一条 api 复用别的类型
 * （`shop.purchase` → `IPurchaseResult`、`party.kick` → `IPartyAcceptRes`、`user.getInfo` → `IGetInfoReq`），
 * 拼出来的名字在生成物里根本不存在，只会让 typecheck 在生成物上报 TS2724。
 */
function readPayloadRef(domain: string, apiName: string, side: 'request' | 'response', raw: unknown): string {
    if (!raw || typeof raw !== 'object') {
        throw new Error(`schema API ${domain}.${apiName} has invalid ${side}`)
    }
    const payload = raw as { kind?: unknown; ref?: unknown }
    if (payload.kind !== 'ref' || typeof payload.ref !== 'string' || payload.ref === '') {
        throw new Error(`schema API ${domain}.${apiName} ${side} must be a ref payload`)
    }
    return payload.ref
}

/**
 * 解析 ref 类型所在模块。
 *
 * 该 ref **必须**在本域 `types` 里声明 —— 否则生成的 descriptor 会 import 一个不存在的名字。
 * 与其等 typecheck 报 TS2724，不如在生成期就 fail-fast。
 */
function resolveTypeModule(
    domain: string,
    apiName: string,
    side: 'request' | 'response',
    ref: string,
    types: Readonly<Record<string, SchemaTypeDeclaration>>,
): string {
    const declaration = types[ref]
    if (!declaration) {
        throw new Error(`schema API ${domain}.${apiName} ${side} ref ${ref} is not declared in ${domain} types`)
    }
    if (declaration.kind !== 'external') return DOMAIN_TYPE_MODULE
    if (typeof declaration.from !== 'string' || declaration.from === '') {
        throw new Error(`schema type ${domain}.${ref} is external but has no from`)
    }
    return declaration.from
}

/**
 * 读取 shared protocol schema 的 API 元数据。
 *
 * schema 是原生 Lobby 路由的**唯一**输入：生成器不再扫描 `src/modules/<module>/*C2S.ts` 来
 * 发现业务路由。旧 C2S/S2S 的 Bean/记录链仍由 Alloy 记录链负责，两者不共享发现入口。
 */
export function readSchemaLobbyApis(projectRoot: string): readonly SchemaLobbyApi[] {
    const root = path.resolve(projectRoot, '../../shared/schema/protocols/C2S')
    if (!fs.existsSync(root)) throw new Error(`shared protocol schema directory is missing: ${root}`)
    const files = fs
        .readdirSync(root)
        .filter((name) => name.endsWith('.json') && name !== 'schema-v1.json')
        .sort()
    const apis: SchemaLobbyApi[] = []
    const routes = new Set<string>()
    const names = new Set<string>()
    for (const fileName of files) {
        const source = path.join(root, fileName)
        const document = JSON.parse(fs.readFileSync(source, 'utf8')) as {
            domain?: unknown
            types?: unknown
            apis?: unknown
        }
        if (typeof document.domain !== 'string' || !Array.isArray(document.apis)) {
            throw new Error(`invalid shared protocol schema document: ${path.relative(projectRoot, source)}`)
        }
        const domain = document.domain
        const types = (document.types ?? {}) as Record<string, SchemaTypeDeclaration>
        if (typeof types !== 'object' || Array.isArray(types)) {
            throw new Error(`schema ${domain} has invalid types`)
        }
        for (const raw of document.apis) {
            if (!raw || typeof raw !== 'object') throw new Error(`invalid API in ${source}`)
            const api = raw as Record<string, unknown>
            for (const field of ['name', 'route', 'serviceType', 'mode', 'ownerModule']) {
                if (typeof api[field] !== 'string' || api[field] === '') {
                    throw new Error(`schema API ${domain} has invalid ${field}`)
                }
            }
            const mode = api.mode
            if (mode !== 'query' && mode !== 'natural-write' && mode !== 'idempotent-write') {
                throw new Error(`schema API ${domain}.${String(api.name)} has invalid mode`)
            }
            const route = api.route as string
            const name = api.name as string
            const requestType = readPayloadRef(domain, name, 'request', api.request)
            const responseType = readPayloadRef(domain, name, 'response', api.response)
            const requestTypeModule = resolveTypeModule(domain, name, 'request', requestType, types)
            const responseTypeModule = resolveTypeModule(domain, name, 'response', responseType, types)
            if (!route.startsWith(`${domain}.`)) {
                throw new Error(`schema route ${route} must belong to domain ${domain}`)
            }
            if (routes.has(route)) throw new Error(`duplicate schema route: ${route}`)
            if (names.has(name)) throw new Error(`duplicate schema API name: ${name}`)
            routes.add(route)
            names.add(name)
            apis.push({
                domain,
                name,
                route,
                serviceType: api.serviceType as string,
                mode,
                ownerModule: api.ownerModule as string,
                requestType,
                responseType,
                requestTypeModule,
                responseTypeModule,
                pending: Object.prototype.hasOwnProperty.call(NativeLobbyPendingRoutes, route),
            })
        }
    }
    return apis.sort((left, right) => left.route.localeCompare(right.route))
}

/**
 * 把 schema 里的类型模块说明符解析成绝对路径。
 *
 * `domains/<domain>.ts` 是解析基准 —— schema 的模块名写的就是「相对域文件」的路径
 * （例如 `../economy` / `../../../kits/arena/api/board/index`），与手写域文件时代的 import
 * 完全一致，因此迁移前后 wire 类型指向同一个文件。
 */
export function resolveSchemaTypeModule(projectRoot: string, api: SchemaLobbyApi, module: string): string {
    const domainFile = path.join(
        projectRoot,
        'generated',
        'lobby-contract',
        'protocol',
        'lobbyRpc',
        'domains',
        `${api.domain}.ts`,
    )
    if (module === DOMAIN_TYPE_MODULE) return domainFile
    return path.resolve(path.dirname(domainFile), module) + '.ts'
}
