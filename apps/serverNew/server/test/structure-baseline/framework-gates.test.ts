import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
    ALL_LOBBY_RPC_TYPES,
    LOBBY_RPC_CONTRACT_VERSIONS,
    LOBBY_RPC_DOMAIN_CONTRACTS,
    LOBBY_RPC_ROUTE_MODES,
    type LobbyRpcType,
} from '../../generated/lobby-contract/protocol/lobbyRpc'
import { Actions } from '../../generated/protocol/server/C2S/actions'
import { serviceProto } from '../../generated/protocol/server/C2S/serviceProto'
import { NativeLobbyPendingRoutes } from '../../src/runtime/lobby/NativeLobbyPendingRoutes'
import { GenerationPaths } from '../../scripts/generator/GenerationPaths'

/**
 * 框架门禁（BF9）。
 *
 * 这一组用例守的是「统一链已经成立」这件事**不会被后续改动悄悄推翻**：
 * 生成物、shared registry、schema 声明三者必须互为全集；手工路由注册不得复活；
 * 普通 Action 不得绕过 Bean 生命周期直接摸 Redis；`@OnlyRedis` 字段不得上网。
 *
 * ⛔ 断言一律落在**生成物/记录的真实内容**上（schema 文档、registry 常量、record.json 元数据），
 * 不用「源码里出现过某个字符串」代替行为结论 —— 唯一例外是「禁止复活」类门禁，
 * 那里的判据本来就是「某段代码不得再存在」。
 */

const projectRoot = process.cwd()
const SCHEMA_ROOT = path.resolve(projectRoot, '../../shared/schema/protocols/C2S')

interface SchemaApi {
    readonly name: string
    readonly route: string
    readonly mode: string
    readonly ownerModule: string
}

interface SchemaDocument {
    readonly domain: string
    readonly contractVersion: number
    readonly apis: readonly SchemaApi[]
}

function readSchemaDocuments(): readonly SchemaDocument[] {
    return fs
        .readdirSync(SCHEMA_ROOT)
        .filter((name) => name.endsWith('.json') && name !== 'schema-v1.json')
        .sort()
        .map((name) => JSON.parse(fs.readFileSync(path.join(SCHEMA_ROOT, name), 'utf8')) as SchemaDocument)
}

/** 递归列出 TypeScript 源文件；`generated/` 是产物，不参与「禁止复活」类扫描。 */
function walkTypeScriptFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) return walkTypeScriptFiles(file)
        return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [file] : []
    })
}

describe('framework integration gates', () => {
    it('keeps the schema declaration, the shared registry and the generated protocol in sync', () => {
        const documents = readSchemaDocuments()
        const declared = documents.flatMap((document) => document.apis.map((api) => ({ ...api, document })))

        assert.deepStrictEqual(
            [...ALL_LOBBY_RPC_TYPES].sort(),
            declared.map((api) => api.route).sort(),
            'shared registry 的路由全集必须逐字等于 schema 声明（双向）',
        )

        for (const { route, mode, document } of declared) {
            assert.strictEqual(LOBBY_RPC_ROUTE_MODES[route as LobbyRpcType], mode, `${route} 的执行模式必须来自 schema`)
            assert.strictEqual(
                LOBBY_RPC_CONTRACT_VERSIONS[route as LobbyRpcType],
                1,
                `${route} 的 API 级契约版本缺省为 1；域级版本由 LOBBY_RPC_DOMAIN_CONTRACTS 承担`,
            )
        }

        // 域契约版本是「domain 生成物字节变化必须同批递增」那条闸的身份，必须逐域对齐 schema。
        const domains = new Set(declared.map((api) => api.document.domain))
        assert.deepStrictEqual(
            Object.keys(LOBBY_RPC_DOMAIN_CONTRACTS).sort(),
            [...domains].sort(),
            '域契约身份表必须与 schema 的域集合一致（双向）',
        )
        for (const document of readSchemaDocuments()) {
            assert.strictEqual(
                LOBBY_RPC_DOMAIN_CONTRACTS[document.domain]?.contractVersion,
                document.contractVersion,
                `${document.domain} 的域契约版本必须等于 schema 的 contractVersion`,
            )
        }

        const protocolNames = new Set(serviceProto.protocols.map((entry) => entry.name))
        for (const { route } of declared) {
            assert.ok(protocolNames.has(route), `serviceProto 必须声明 schema 路由 ${route}`)
        }
        for (const { route } of declared) {
            const pending = Object.prototype.hasOwnProperty.call(NativeLobbyPendingRoutes, route)
            assert.strictEqual(
                Object.prototype.hasOwnProperty.call(Actions, route),
                !pending,
                pending
                    ? `${route} 归属另一条产品线，⛔ 不得进本项目的 Actions 注册表`
                    : `Actions 必须按 schema 生成 ${route}`,
            )
        }
    })

    it('keeps the schema-owned routes out of hand-written Native Lobby registrations', () => {
        const routes = readSchemaDocuments().flatMap((document) => document.apis.map((api) => api.route))

        // ① 普通业务（`src/modules/**`）的 `*NativeLobbyRoutes.ts` 必须全部删除（§8 最终删除项）。
        // `src/runtime/lobby/NativeLobbyRoutes.ts` 是**装配器**不是业务路由：它保留（§8 保留清单）。
        const legacyRouteFiles = walkTypeScriptFiles(path.join(projectRoot, 'src/modules')).filter((file) =>
            /NativeLobbyRoutes\.ts$/.test(file),
        )
        assert.deepStrictEqual(
            legacyRouteFiles.map((file) => path.relative(projectRoot, file)),
            [],
            '普通业务不得再持有手工 Native Lobby 路由文件',
        )

        // ② schema 已声明的路由不得再出现在任何手工 `register(<route>, …)` 调用里。
        const sources = walkTypeScriptFiles(path.join(projectRoot, 'src'))
        const offenders: string[] = []
        for (const file of sources) {
            const content = fs.readFileSync(file, 'utf8')
            for (const route of routes) {
                if (content.includes(`register('${route}'`) || content.includes(`register("${route}"`)) {
                    offenders.push(`${path.relative(projectRoot, file)} → ${route}`)
                }
            }
        }
        assert.deepStrictEqual(offenders, [], 'schema 拥有的路由只能由生成的 Actions 提供')
    })

    it('keeps ordinary Actions off the Redis instance and lists the explicit exceptions', () => {
        /**
         * 允许直接使用 `RedisInstance` 的**业务** Action 目录与原因。
         *
         * 判据是「这段原子性无法用单玩家 Bean 表达」：显式事务存储 / 计数器分配 / 跨玩家共享聚合。
         * ⛔ 不要为了让它变绿而往这里加条目 —— 新增条目等于承认那条 Action 绕过了 `RedisTask`
         * 的提交与 `ModSync` 的同步面，必须同时说明为什么 Bean 表达不了。
         */
        const ALLOWED: Readonly<Record<string, string>> = {
            'src/modules/mail/action':
                '邮件 id 分配与批量投递是显式事务存储（区服 Redis 计数器 + 原子批次），单玩家 Bean 表达不了',
            'src/modules/user/action': '登录档案落在中心库、按外部 openId 寻址，不属于单玩家 Bean 的提交点',
        }

        // 只扫**业务** Action 目录：`src/runtime/action/**` 是框架侧调度与延迟队列（`QueuedLocalAction`
        // 直接操作中心库 ZSET 是它的职责），把它算进来只会让门禁变成「框架不得用 Redis」。
        const actionFiles = walkTypeScriptFiles(path.join(projectRoot, 'src/modules')).filter((file) =>
            /[\\/]action[\\/][^\\/]+\.ts$/.test(file),
        )
        assert.ok(actionFiles.length > 0, '必须真的扫到业务 Action 文件，否则这条门禁什么都没证明')

        const usesRedisInstance = (file: string) =>
            /import[^;]*RedisInstance[^;]*from/.test(fs.readFileSync(file, 'utf8'))

        const offenders = new Set<string>()
        for (const file of actionFiles) {
            if (!usesRedisInstance(file)) continue
            const relative = path.relative(projectRoot, file)
            // 归属目录固定是 `src/modules/<模块>/action`；按**模块**而非文件豁免。
            const owner = relative.split('/').slice(0, 4).join('/')
            if (!Object.prototype.hasOwnProperty.call(ALLOWED, owner)) offenders.add(relative)
        }
        assert.deepStrictEqual([...offenders].sort(), [], '普通 Action 不得直接 import RedisInstance')

        // 允许清单本身也要承重：条目不得陈旧（对应目录已不再直接使用 RedisInstance 就要删掉）。
        const stale = Object.keys(ALLOWED).filter(
            (owner) =>
                !actionFiles.some(
                    (file) => path.relative(projectRoot, file).startsWith(owner) && usesRedisInstance(file),
                ),
        )
        assert.deepStrictEqual(stale, [], '允许清单里的条目已无对应使用点，必须同批删除')
    })

    it('keeps the income Action chain on the Bean lifecycle', () => {
        const actionRoot = path.join(projectRoot, 'src/modules/income/action')
        const files = walkTypeScriptFiles(actionRoot)
        assert.ok(files.length > 0, 'income 必须有 Action 实现')

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8')
            const relative = path.relative(projectRoot, file)
            for (const banned of ['RedisInstance', 'recordObjectActionSync', 'IncomeNativeLobbyStore']) {
                assert.ok(!content.includes(banned), `${relative} ⛔ 不得使用 ${banned}：income 必须只走 User Bean`)
            }
        }

        // 第二套框架的落点必须整件消失，⛔ 不得只删调用方。
        for (const removed of [
            'src/modules/income/lobby/IncomeNativeLobbyStore.ts',
            'src/modules/income/lobby/IncomeNativeLobbyRoutes.ts',
            'src/modules/income/IncomeAccount.ts',
        ]) {
            assert.strictEqual(fs.existsSync(path.join(projectRoot, removed)), false, `${removed} 必须已删除`)
        }

        // 第二套账户键不得在运行时读写里复活（测试里的**负例断言**不算读写）。
        const runtimeSources = [
            ...walkTypeScriptFiles(path.join(projectRoot, 'src')),
            ...walkTypeScriptFiles(path.join(projectRoot, 'scripts')),
        ]
        const revived = runtimeSources
            .filter((file) => fs.readFileSync(file, 'utf8').includes('nativeLobby:income:account'))
            .map((file) => path.relative(projectRoot, file))
        assert.deepStrictEqual(revived, [], 'income 第二套账户键不得再出现在运行时或脚本里')
    })

    it('keeps the Bean sync metadata consistent with the network surface', () => {
        const record = JSON.parse(fs.readFileSync(path.join(projectRoot, 'generated/records/record.json'), 'utf8')) as {
            readonly modVersion: number
            readonly beans: Record<
                string,
                {
                    readonly modId: number
                    readonly modType: string
                    readonly version: number
                    readonly properties: Record<
                        string,
                        { readonly decorators?: readonly string[]; readonly saveType?: string; readonly id: number }
                    >
                }
            >
        }
        const user = record.beans['User.ts']
        assert.ok(user, 'record.json 必须登记 User Bean')
        assert.strictEqual(user.modType, 'ModType.ModBean')
        assert.ok(Number.isSafeInteger(user.modId) && user.modId > 0, 'User Bean 必须有稳定的 modId')
        assert.ok(Number.isSafeInteger(user.version) && user.version > 0, 'User Bean 必须有递增的记录版本')

        const field = (name: string) => {
            const property = user.properties[name]
            assert.ok(property, `User Bean 必须有字段 ${name}`)
            return property
        }

        // 领取离线收益必须依赖「铜币是网络字段」+「三个内部字段是 @OnlyRedis」这一对前提。
        const copper = field('copper')
        assert.ok(!(copper.decorators ?? []).includes('@OnlyRedis'), 'copper 必须是可同步字段')
        assert.strictEqual(copper.saveType, 'SaveType.All', 'copper 必须落普通存储与网络面')

        for (const hidden of ['lastCopperIncomeTime', 'offlineCopperPending', 'offlineCopperSecondsPending']) {
            const property = field(hidden)
            assert.ok(
                (property.decorators ?? []).includes('@OnlyRedis'),
                `${hidden} 必须是 @OnlyRedis，否则服务端结算时序会被同步到客户端`,
            )
            assert.strictEqual(property.saveType, 'SaveType.ForRedis', `${hidden} 只能落 Redis`)
        }

        // 每个 Bean 的字段 id 必须唯一且为正整数：重复 id 会让持久化把两个字段写成同一个槽位。
        for (const [fileName, bean] of Object.entries(record.beans)) {
            const ids = new Set<number>()
            for (const [name, property] of Object.entries(bean.properties)) {
                assert.ok(
                    Number.isSafeInteger(property.id) && property.id > 0,
                    `${fileName}.${name} 的字段 id 必须是正整数`,
                )
                assert.ok(!ids.has(property.id), `${fileName} 的字段 id ${property.id} 重复`)
                ids.add(property.id)
            }
        }
        assert.ok(record.modVersion > 1, 'modVersion 必须原地推进而不是被重置')
    })

    it('keeps the shared schema as the only C2S protocol declaration source', () => {
        // ① 业务模块不得再持有 `*C2S.ts`，包括仅借用旧请求/响应形状的伪协议文件。
        const modulesRoot = path.join(projectRoot, 'src/modules')
        const moduleC2SFiles = walkTypeScriptFiles(modulesRoot)
            .filter((file) => file.endsWith('C2S.ts'))
            .map((file) => path.relative(modulesRoot, file))
            .sort()
        assert.deepStrictEqual(
            moduleC2SFiles,
            [],
            '业务模块 C2S 协议文件不得复活：新增业务路由先在 apps/shared/schema/protocols 里声明',
        )

        // ② 生成器的 C2S 发现面必须只剩框架级锚点。任何 `moduleOwned` 的 C2S 源都会让业务模块
        // TS 协议重新变成第二真源（同一路由两套声明、两套生成产物），这正是 BF3 拆掉的东西。
        const discovered = new GenerationPaths(projectRoot).discoverProtocolSources('C2S')
        assert.ok(discovered.length > 0, 'C2S 发现面必须保留框架级协议锚点')
        assert.deepStrictEqual(
            discovered
                .filter((source) => source.moduleOwned)
                .map((source) => path.relative(projectRoot, source.filePath)),
            [],
            'C2S 发现面不得再包含业务模块协议文件',
        )
        const runtimeProtocolRoot = path.join(projectRoot, 'src', 'runtime', 'protocol', 'C2S')
        for (const source of discovered) {
            assert.ok(
                source.filePath.startsWith(runtimeProtocolRoot + path.sep),
                `C2S 协议源 ${path.relative(projectRoot, source.filePath)} 必须落在 src/runtime/protocol/C2S/`,
            )
        }
    })
})
