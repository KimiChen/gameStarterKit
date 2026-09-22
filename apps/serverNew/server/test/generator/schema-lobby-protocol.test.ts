import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { GenerationPaths } from '../../scripts/generator/GenerationPaths'
import { GenProtocol } from '../../scripts/generator/differ/GenProtocol'
import { RecProject } from '../../scripts/generator/differ/record/RecProject'
import { RecProtocolGroup } from '../../scripts/generator/differ/record/RecProtocolGroup'
import {
    readSchemaLobbyApis,
    resolveSchemaTypeModule,
    type SchemaLobbyApi,
} from '../../scripts/generator/SchemaLobbyProtocol'
import { Actions } from '../../generated/protocol/server/C2S/actions'
import { serviceProto } from '../../generated/protocol/server/C2S/serviceProto'

/**
 * BF3：schema 接入 serverNew 的协议与 Action 生成器。
 *
 * 这一组用例钉的是**生成器的输入契约**，不是生成物长什么样：
 *
 * 1. 原生 Lobby 路由只能来自 `apps/shared/schema/protocols/C2S/*.json`；临时工程里放一个
 *    手写 `*C2S.ts` 不得凭空多出一条 Lobby 路由（§2.1「禁止同时从旧 TS 协议和 schema 读取」）。
 * 2. wire 类型名取自 schema 的 `request.ref` / `response.ref`，⛔ 不从 api 名拼 `I<name>Req`
 *    —— `user.getInfo` → `IGetInfoReq`、`shop.purchase` → `IPurchaseResult` 这类复用靠拼名字
 *    必错，且错误只会在生成物 typecheck 时暴露。
 * 3. 缺 Action 时主动生成**一次**骨架，已有文件不得覆盖；检查命令只报告缺失。
 * 4. `generated/records/record.json` 只能原地推进：Bean 顺序与 modVersion 都不允许被重建。
 */

const SCHEMA_RELATIVE_ROOT = path.join('shared', 'schema', 'protocols', 'C2S')

describe('schema-owned Lobby protocol generation', () => {
    it('reads the Lobby API surface only from the shared protocol schema', () => {
        const workspace = createWorkspace()
        try {
            // 手写 C2S 协议源在临时工程里真实存在，但它**不是** Lobby 面的输入。
            writeFile(workspace, 'alloy-demo/alloy-server/src/modules/income/IncomeC2S.ts', 'export interface ReqX {}')
            assert.throws(
                () => readSchemaLobbyApis(serverRootOf(workspace)),
                /shared protocol schema directory is missing/,
                '没有 schema 时必须 fail-fast，而不是回落到旧 TS 协议源',
            )

            writeSchema(workspace, 'income.json', incomeSchema())
            const apis = readSchemaLobbyApis(serverRootOf(workspace))
            assert.deepStrictEqual(
                apis.map((api) => api.route),
                ['income.claimOffline'],
                'Lobby 路由集合必须逐字等于 schema 声明，手写 C2S 源不得贡献任何一条',
            )
        } finally {
            fs.rmSync(workspace, { recursive: true, force: true })
        }
    })

    it('derives the wire type names and their modules from the schema refs', () => {
        const root = process.cwd()
        const apis = readSchemaLobbyApis(root)
        const declared = readDeclaredSchemaTypes(root)

        assert.ok(apis.length > 0, '真仓必须有 schema 声明的 Lobby 路由')
        for (const api of apis) {
            const types = declared.get(api.domain)
            assert.ok(types, `schema 缺少 ${api.domain} 域`)
            const request = types.get(api.requestType)
            const response = types.get(api.responseType)
            assert.ok(request, `${api.route} 的请求类型 ${api.requestType} 必须在本域 types 里声明`)
            assert.ok(response, `${api.route} 的响应类型 ${api.responseType} 必须在本域 types 里声明`)
            assert.strictEqual(
                api.requestTypeModule,
                request.kind === 'external' ? request.from : '.',
                `${api.route} 的请求类型模块必须来自 external.from 或域文件自身`,
            )
            assert.strictEqual(
                api.responseTypeModule,
                response.kind === 'external' ? response.from : '.',
                `${api.route} 的响应类型模块必须来自 external.from 或域文件自身`,
            )
        }

        // 三条「拼名字必错」的真实样本：api 名与类型名不同，且响应落在域文件之外。
        assert.strictEqual(find(apis, 'user.getInfo').requestType, 'IGetInfoReq')
        assert.strictEqual(find(apis, 'shop.purchase').responseType, 'IPurchaseResult')
        assert.strictEqual(find(apis, 'shop.purchase').responseTypeModule, '../economy')
        assert.strictEqual(find(apis, 'party.kick').responseType, 'IPartyAcceptRes')
    })

    it('resolves schema type modules against the generated domain file', () => {
        const root = process.cwd()
        const domainFile = path.join(root, 'generated', 'lobby-contract', 'protocol', 'lobbyRpc', 'domains', 'shop.ts')
        const shop = find(readSchemaLobbyApis(root), 'shop.purchase')
        assert.strictEqual(resolveSchemaTypeModule(root, shop, '.'), domainFile)
        assert.strictEqual(
            resolveSchemaTypeModule(root, shop, '../economy'),
            path.join(root, 'generated', 'lobby-contract', 'protocol', 'lobbyRpc', 'economy.ts'),
        )
    })

    it('fails fast on a schema the generator cannot render', () => {
        const cases: readonly {
            readonly name: string
            readonly mutate: (schema: SchemaDocument) => void
            readonly expect: RegExp
        }[] = [
            {
                name: 'request 不是 ref',
                mutate: (schema) => {
                    schema.apis[0].request = { kind: 'object', fields: [] }
                },
                expect: /request must be a ref payload/,
            },
            {
                name: 'response 不是 ref',
                mutate: (schema) => {
                    schema.apis[0].response = { kind: 'object', fields: [] }
                },
                expect: /response must be a ref payload/,
            },
            {
                name: 'response 缺失',
                mutate: (schema) => {
                    delete schema.apis[0].response
                },
                expect: /has invalid response/,
            },
            {
                name: 'ref 未在本域声明',
                mutate: (schema) => {
                    schema.apis[0].response = { kind: 'ref', ref: 'IMissingRes' }
                },
                expect: /response ref IMissingRes is not declared in income types/,
            },
            {
                name: 'external 没有 from',
                mutate: (schema) => {
                    schema.types.IIncomeClaimOfflineRes = { kind: 'external', check: { fn: 'f', from: '../x' } }
                },
                expect: /is external but has no from/,
            },
            {
                name: 'route 不属于本域',
                mutate: (schema) => {
                    schema.apis[0].route = 'arena.board'
                },
                expect: /must belong to domain income/,
            },
        ]

        for (const entry of cases) {
            const workspace = createWorkspace()
            try {
                const schema = incomeSchema() as SchemaDocument
                entry.mutate(schema)
                writeSchema(workspace, 'income.json', schema)
                assert.throws(() => readSchemaLobbyApis(serverRootOf(workspace)), entry.expect, entry.name)
            } finally {
                fs.rmSync(workspace, { recursive: true, force: true })
            }
        }

        // 重复 route：两个域文件声明同一条路由必须被拒（跨文件规则只有生成器看得到全集）。
        const duplicated = createWorkspace()
        try {
            writeSchema(duplicated, 'income.json', incomeSchema())
            writeSchema(duplicated, 'incomeCopy.json', incomeSchema())
            assert.throws(() => readSchemaLobbyApis(serverRootOf(duplicated)), /duplicate schema route/)
        } finally {
            fs.rmSync(duplicated, { recursive: true, force: true })
        }
    })

    it('creates a missing Action skeleton once and never overwrites an existing file', () => {
        const workspace = createWorkspace()
        try {
            writeSchema(workspace, 'income.json', incomeSchema())
            const project = tempProject(workspace)
            const actionFile = path.join(
                serverRootOf(workspace),
                'src',
                'modules',
                'income',
                'action',
                'ActionIncomeClaimOffline.ts',
            )
            assert.strictEqual(fs.existsSync(actionFile), false, '夹具必须从「Action 缺失」开始')

            project.genProtocol.genActionsTS(emptyGroup())
            assert.strictEqual(fs.existsSync(actionFile), true, '主动生成必须补齐缺失的 Action 骨架')
            const skeleton = fs.readFileSync(actionFile, 'utf8')
            assert.match(skeleton, /extends GameAction/)
            assert.match(skeleton, /IIncomeClaimOfflineReq/)
            assert.match(skeleton, /IIncomeClaimOfflineRes/)
            assert.match(
                skeleton,
                /from '\.\.\/\.\.\/\.\.\/\.\.\/generated\/lobby-contract\/protocol\/lobbyRpc\/domains\/income'/,
                '骨架的类型 import 必须指向生成的 shared 域文件',
            )

            const registry = fs.readFileSync(
                path.join(serverRootOf(workspace), 'generated', 'protocol', 'server', 'C2S', 'actions.ts'),
                'utf8',
            )
            assert.match(registry, /'income\.claimOffline' : ActionIncomeClaimOffline/)

            // 已有文件不得被覆盖：第二次生成必须原样保留业务实现。
            const implemented = skeleton.replace('return\n', 'return res.copper = 7\n')
            fs.writeFileSync(actionFile, implemented)
            project.genProtocol.genActionsTS(emptyGroup())
            assert.strictEqual(fs.readFileSync(actionFile, 'utf8'), implemented)
        } finally {
            fs.rmSync(workspace, { recursive: true, force: true })
        }
    })

    it('serves income.claimOffline from the generated registry without a numeric protocol id', () => {
        const entry = serviceProto.protocols.find((item) => item.name === 'income.claimOffline')
        assert.ok(entry, 'income.claimOffline 必须出现在 C2S serviceProto')
        assert.strictEqual(entry.type, 'api')
        assert.strictEqual(entry.serviceType, 'Base')
        assert.deepStrictEqual(
            Object.keys(entry).sort(),
            ['name', 'serviceType', 'type'],
            '协议条目只允许字符串 route / type / serviceType，⛔ 不得有数字协议号或内联 schema',
        )

        const ActionClass = (Actions as Record<string, unknown>)['income.claimOffline']
        assert.strictEqual(typeof ActionClass, 'function', 'Actions 注册表必须能按路由名取到 Action 类')
        const instance = new (ActionClass as new () => { doAction?: unknown })()
        assert.strictEqual(typeof instance.doAction, 'function', '取到的类必须可实例化并实现 doAction')
    })

    it('advances the compatibility record in place instead of rebuilding it', () => {
        const recordFile = path.join(process.cwd(), 'generated', 'records', 'record.json')
        const committed = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as {
            readonly modVersion: number
            readonly beans: Record<string, unknown>
            readonly protocols: Record<string, unknown>
        }
        assert.ok(Number.isSafeInteger(committed.modVersion) && committed.modVersion > 1)
        assert.ok(Object.keys(committed.beans).length > 0)
        assert.deepStrictEqual(Object.keys(committed.protocols).sort(), ['C2S', 'S2S'])

        const project = new RecProject().init(process.cwd())
        assert.deepStrictEqual(
            [...project.beans.keys()],
            Object.keys(committed.beans),
            '记录里的 Bean 顺序必须原地保留 —— 重排会让所有 Bean 的相对位置漂移',
        )
        assert.strictEqual(project.modVersion, committed.modVersion)

        // 缺记录必须 fail-fast，⛔ 不允许「创建空记录重新分配 ID」。
        const workspace = createWorkspace()
        try {
            assert.throws(
                () => new RecProject().init(serverRootOf(workspace)),
                /请从 Git 恢复 generated\/records\/record\.json/,
            )
        } finally {
            fs.rmSync(workspace, { recursive: true, force: true })
        }
    })
})

/** schema 文档的宽松形态：本文件只关心生成器读取的那几个键。 */
interface SchemaDocument {
    domain: string
    contractVersion: number
    errorCodes: Record<string, unknown>
    types: Record<string, SchemaTypeDeclaration>
    apis: SchemaApiDeclaration[]
}

interface SchemaTypeDeclaration {
    kind?: string
    from?: string
    check?: unknown
    fields?: unknown
}

interface SchemaApiDeclaration {
    name: string
    route: string
    serviceType: string
    mode: string
    ownerModule: string
    request?: unknown
    response?: unknown
}

function find(apis: readonly SchemaLobbyApi[], route: string): SchemaLobbyApi {
    const api = apis.find((item) => item.route === route)
    assert.ok(api, `schema 必须声明 ${route}`)
    return api
}

/** 读真仓 14 个域文件里的类型声明，用来独立核对生成器的推导结果。 */
function readDeclaredSchemaTypes(root: string): Map<string, Map<string, SchemaTypeDeclaration>> {
    const directory = path.resolve(root, '..', '..', 'shared', 'schema', 'protocols', 'C2S')
    const declared = new Map<string, Map<string, SchemaTypeDeclaration>>()
    for (const name of fs.readdirSync(directory)) {
        if (!name.endsWith('.json') || name === 'schema-v1.json') continue
        const document = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as SchemaDocument
        declared.set(document.domain, new Map(Object.entries(document.types ?? {})))
    }
    return declared
}

/** 最小 income 声明：一条 idempotent-write 路由 + 域内 Req/Res。 */
function incomeSchema(): SchemaDocument {
    return {
        domain: 'income',
        contractVersion: 1,
        errorCodes: { INCOME_EMPTY: { code: 1, message: '无可领取收益' } },
        types: {
            IIncomeClaimOfflineReq: {
                kind: 'object',
                fields: [{ name: 'clientReqId', kind: 'string', minLength: 1, maxLength: 64 }],
            },
            IIncomeClaimOfflineRes: {
                kind: 'object',
                fields: [
                    { name: 'copper', kind: 'integer', min: 0 },
                    { name: 'offlineSeconds', kind: 'integer', min: 0 },
                    { name: 'balance', kind: 'integer', min: 0 },
                ],
            },
        },
        apis: [
            {
                name: 'IncomeClaimOffline',
                route: 'income.claimOffline',
                serviceType: 'Base',
                mode: 'idempotent-write',
                ownerModule: 'income',
                request: { kind: 'ref', ref: 'IIncomeClaimOfflineReq' },
                response: { kind: 'ref', ref: 'IIncomeClaimOfflineRes' },
            },
        ],
    }
}

/**
 * 临时工程布局必须与真仓一致：`readSchemaLobbyApis` 从工程根往上两级找 shared。
 *
 * ```text
 * <workspace>/shared/schema/protocols/C2S/<域>.json
 * <workspace>/alloy-demo/alloy-server/            <- 工程根（= server/）
 * ```
 */
function createWorkspace(): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-schema-lobby-'))
    fs.mkdirSync(serverRootOf(workspace), { recursive: true })
    return workspace
}

function serverRootOf(workspace: string): string {
    return path.join(workspace, 'alloy-demo', 'alloy-server')
}

function writeSchema(workspace: string, fileName: string, schema: SchemaDocument): void {
    const target = path.join(workspace, SCHEMA_RELATIVE_ROOT, fileName)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(schema, null, 2))
}

function writeFile(workspace: string, relativePath: string, content: string): void {
    const target = path.join(workspace, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
}

/** 只装 paths / projectPath / toFormatFiles 的最小工程；生成器其余状态与本组用例无关。 */
function tempProject(workspace: string): RecProject {
    const root = serverRootOf(workspace)
    const project = new RecProject()
    project.projectPath = root
    project.paths = new GenerationPaths(root)
    project.toFormatFiles = []
    project.genProtocol = new GenProtocol(project)
    return project
}

/** 只声明方向的最小协议分组：本组用例只走 schema 分支，没有手写协议源。 */
function emptyGroup(): RecProtocolGroup {
    const group = new RecProtocolGroup()
    group.name = 'C2S'
    group.protocols = new Map()
    return group
}
