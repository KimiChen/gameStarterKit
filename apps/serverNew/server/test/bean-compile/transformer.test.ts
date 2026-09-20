import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import ts from 'typescript'
import { createBeanCompileTransformer } from '../../scripts/bean-compile/transformer'

interface TransformFixture {
    source: string
    record: object
    relativeFile?: string
    sourceRelativeFile?: string
}

const temporaryRoots: string[] = []

afterEach(() => {
    while (temporaryRoots.length) {
        fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true })
    }
})

describe('Bean 编译 transformer', () => {
    it('uses the stable base/User record for the module-owned User source', () => {
        const result = transformFixture({
            sourceRelativeFile: 'src/modules/user/bean/User.ts',
            source: `
                import { UserHash } from '@arthropoda/game-engine'
                export class User extends UserHash { id: int = 0 }
            `,
            record: beanRecord(
                'User',
                '/base/User',
                { id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }) },
                { diffType: 2, extendType: 'UserHash', idFiledType: 'int' },
            ),
        })

        assert.match(result.ts, /new __alloyBeanRuntime\.ClassInfo\("User", User/)
        assert.doesNotMatch(result.ts, /record\.json 中找不到/)
    })

    it('在业务类内生成等价成员、运行时 import 和稳定字段注册顺序', () => {
        const result = transformFixture({
            relativeFile: 'user/SampleBean.ts',
            source: `
                import { Bean, DiffArray, OnlyNet } from '@arthropoda/game-engine'

                export class SampleBean extends Bean {
                    /** 唯一编号 */
                    id: int = 0

                    @OnlyNet
                    title?: string

                    tags?: DiffArray<int>

                    ping() { return this.id }
                }
            `,
            record: beanRecord(
                'SampleBean',
                '/user/SampleBean',
                {
                    id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }),
                    title: fieldRecord(2, 'title', 'string', 'string', null, {
                        defaultValue: '""',
                        optional: true,
                        decorators: ['@OnlyNet'],
                        saveType: 'SaveType.ForNet',
                    }),
                    tags: fieldRecord(3, 'tags', 'Array', 'DiffArray<int>', null, {
                        optional: true,
                        collectionTypes: ['int'],
                    }),
                },
                { initFunc: true },
            ),
        })

        assert.match(result.ts, /import \* as __alloyBeanRuntime from ["']@arthropoda\/game-engine["']/)
        assert.match(result.ts, /\/\*\* 唯一编号 \*\//)
        assert.match(result.ts, /constructor\(data\?: Partial<SampleBean>\)/)
        assert.match(result.ts, /if \(data\?\.id\)/)
        assert.match(result.ts, /this\._id = Math\.trunc\(data\.id\)/)
        assert.match(result.ts, /new __alloyBeanRuntime\.ClassInfo\("SampleBean", SampleBean\)/)
        assert.doesNotMatch(result.ts, /super\.name/)
        assert.match(result.ts, /buildNet\(data: Partial<this>\)/)
        assert.match(result.ts, /new __alloyBeanRuntime\.DiffArray<int>\(SampleBean\.f_tags\)/)

        const registrations = Array.from(result.ts.matchAll(/addField\(SampleBean\.f_(\w+)\)/g)).map(
            (match) => match[1],
        )
        assert.deepStrictEqual(registrations, ['id', 'title', 'tags'])
        assert.match(result.js, /const __alloyBeanRuntime = require\("@arthropoda\/game-engine"\)/)
        assert.match(result.js, /__alloyBeanRuntime\.FieldStatus\.Update/)
        assert.doesNotMatch(result.ts, /class SampleBeanGen/)
        assert.match(result.ts, /ping\(\) \{ return this\.id; \}/)
    })

    it('生成 Hash/HashJson 构造参数并使用业务类名建立 ClassInfo', () => {
        const hash = transformFixture({
            relativeFile: 'user/UserState.ts',
            source: `
                import { UserHash, DiffMap } from '@arthropoda/game-engine'
                export class UserState extends UserHash {
                    id: int = 0
                    values?: DiffMap<int, int>
                }
            `,
            record: beanRecord(
                'UserState',
                '/user/UserState',
                {
                    id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }),
                    values: fieldRecord(2, 'values', 'Map', 'DiffMap<int, int>', null, {
                        optional: true,
                        collectionTypes: ['int', 'int'],
                    }),
                },
                { diffType: 2, extendType: 'UserHash', idFiledType: 'int', modId: 17 },
            ),
        })
        assert.match(hash.ts, /constructor\(id: int, loadOpts\?: __alloyBeanRuntime\.HashLoadOpts, byLoad = false\)/)
        assert.match(hash.ts, /super\(id, loadOpts, byLoad\)/)
        assert.match(hash.ts, /new __alloyBeanRuntime\.ClassInfo\("UserState", UserState, 17,/)
        assert.match(hash.ts, /this\.tryLoad\("values"\)/)

        const hashJson = transformFixture({
            relativeFile: 'server/Stage.ts',
            source: `
                import { ServerHashJson } from '@arthropoda/game-engine'
                export class Stage extends ServerHashJson { id: int = 0 }
            `,
            record: beanRecord(
                'Stage',
                '/server/Stage',
                { id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }) },
                { diffType: 3, extendType: 'ServerHashJson', idFiledType: 'int' },
            ),
        })
        assert.match(
            hashJson.ts,
            /constructor\(id: int, rootKey\?: string, loadOpts\?: __alloyBeanRuntime\.HashLoadOpts, byLoad = false\)/,
        )
        assert.match(hashJson.ts, /super\(id, rootKey, loadOpts, byLoad\)/)
    })

    it('对 initializer、可选性和装饰器过期给出可定位的生成命令', () => {
        const baseRecord = beanRecord('StaleBean', '/stale/StaleBean', {
            value: fieldRecord(1, 'value', 'int', 'int', '0', { defaultValue: '0' }),
        })
        for (const source of [
            `import { Bean } from '@arthropoda/game-engine'; export class StaleBean extends Bean { value: int = 1 }`,
            `import { Bean } from '@arthropoda/game-engine'; export class StaleBean extends Bean { value?: int = 0 }`,
            `import { Bean, OnlyNet } from '@arthropoda/game-engine'; export class StaleBean extends Bean { @OnlyNet value: int = 0 }`,
        ]) {
            assert.throws(
                () => transformFixture({ source, record: baseRecord, relativeFile: 'stale/StaleBean.ts' }),
                (error: unknown) => {
                    assert(error instanceof Error)
                    assert.match(error.message, /StaleBean\.ts:1:/)
                    assert.match(error.message, /请先执行 pnpm 一键生成代码/)
                    return true
                },
            )
        }
    })

    it('明确排除 RefHash，并在过渡期跳过仍含旧 Gen 的文件', () => {
        const refSource = `
            import { RefHash } from '@arthropoda/game-engine'
            export class UserRef extends RefHash { id: int = 0 }
        `
        const refResult = transformFixture({ source: refSource, record: { beans: {} }, relativeFile: 'ref/UserRef.ts' })
        assert.doesNotMatch(refResult.ts, /__alloyBeanRuntime/)
        assert.match(refResult.ts, /class UserRef extends RefHash/)

        const legacySource = `
            import { Bean } from '@arthropoda/game-engine'
            class LegacyBean extends Bean { value: int = 0 }
            class LegacyBeanGen extends LegacyBean {}
            export { LegacyBeanGen as LegacyBean }
        `
        const legacyResult = transformFixture({
            source: legacySource,
            record: { beans: {} },
            relativeFile: 'legacy/LegacyBean.ts',
        })
        assert.doesNotMatch(legacyResult.ts, /__alloyBeanRuntime/)
        assert.match(legacyResult.ts, /class LegacyBeanGen extends LegacyBean/)
    })

    it('重复转换不会再次插入成员或运行时 import', () => {
        const fixture: TransformFixture = {
            relativeFile: 'repeat/RepeatBean.ts',
            source: `import { Bean } from '@arthropoda/game-engine'; export class RepeatBean extends Bean { value: int = 0 }`,
            record: beanRecord('RepeatBean', '/repeat/RepeatBean', {
                value: fieldRecord(1, 'value', 'int', 'int', '0', { defaultValue: '0' }),
            }),
        }
        const first = transformFixture(fixture)
        const second = transformFixture({ ...fixture, source: first.ts })
        assert.strictEqual((second.ts.match(/import \* as __alloyBeanRuntime/g) ?? []).length, 1)
        assert.strictEqual((second.ts.match(/static _class_info/g) ?? []).length, 1)
        assert.strictEqual((second.ts.match(/get value\(/g) ?? []).length, 1)
    })

    it('保持 truthy/falsy、int、NaN、oldVal 和集合/嵌套 Bean 延迟构造语义', () => {
        const transformed = transformFixture({
            relativeFile: 'runtime/BehaviorBean.ts',
            source: `
                import { Bean, DiffArray, DiffMap } from '@arthropoda/game-engine'

                class NestedBean {
                    static _class_info = { name: 'NestedBean' }
                    parsed?: object
                    initArgs?: unknown[]
                    parseFromData(data: object) { this.parsed = data }
                    initDiff(...args: unknown[]) { this.initArgs = args }
                }

                export class BehaviorBean extends Bean {
                    count: int = 4
                    enabled: boolean = true
                    items?: DiffArray<int>
                    values?: DiffMap<int, int>
                    nested?: NestedBean
                }
            `,
            record: beanRecord('BehaviorBean', '/runtime/BehaviorBean', {
                count: fieldRecord(1, 'count', 'int', 'int', '4', { defaultValue: '4' }),
                enabled: fieldRecord(2, 'enabled', 'boolean', 'boolean', 'true', { defaultValue: 'true' }),
                items: fieldRecord(3, 'items', 'Array', 'DiffArray<int>', null, {
                    optional: true,
                    collectionTypes: ['int'],
                }),
                values: fieldRecord(4, 'values', 'Map', 'DiffMap<int, int>', null, {
                    optional: true,
                    collectionTypes: ['int', 'int'],
                }),
                nested: fieldRecord(5, 'nested', 'NestedBean', 'NestedBean', null, {
                    optional: true,
                }),
            }),
        })
        const engine = createEngineMock()
        const exports = executeCommonJs(transformed.js, engine) as { BehaviorBean: new (data?: object) => any }

        const falsy = new exports.BehaviorBean({ count: 0, enabled: false })
        assert.strictEqual(falsy.count, 4)
        assert.strictEqual(falsy.enabled, true)

        const bean = new exports.BehaviorBean({ count: 2.9 })
        assert.strictEqual(bean.count, 2)
        bean.count = 8.7
        assert.strictEqual(bean.count, 8)
        assert.deepStrictEqual(bean.changes.at(-1), {
            field: 'count',
            status: engine.FieldStatus.Update,
            oldVal: 2,
        })
        assert.throws(() => {
            bean.count = Number.NaN
        }, /is not a number or NaN/)

        assert(bean.items instanceof engine.DiffArray)
        assert.deepStrictEqual(bean.items.initArgs.slice(0, 2), [bean, (exports.BehaviorBean as any).f_items])
        assert(bean.values instanceof engine.DiffMap)
        assert.deepStrictEqual(bean.values.initArgs, [bean, (exports.BehaviorBean as any).f_values])

        bean._nested = JSON.stringify({ value: 9 })
        const nested = bean.nested
        assert.deepStrictEqual(nested.parsed, { value: 9 })
        assert.deepStrictEqual(nested.initArgs, [bean, (exports.BehaviorBean as any).f_nested, { value: 9 }])
    })

    it('保持 Hash Redis key/构造参数与 HashJson rootKey/手写方法', () => {
        const engine = createEngineMock()
        const hash = transformFixture({
            relativeFile: 'runtime/UserState.ts',
            source: `
                import { UserHash } from '@arthropoda/game-engine'
                export class UserState extends UserHash { id: int = 0 }
            `,
            record: beanRecord(
                'UserState',
                '/runtime/UserState',
                { id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }) },
                { diffType: 2, extendType: 'UserHash', idFiledType: 'int' },
            ),
        })
        const hashExports = executeCommonJs(hash.js, engine) as { UserState: new (...args: any[]) => any }
        const state = new hashExports.UserState(12, { serverId: 3 }, true)
        assert.deepStrictEqual(state.baseArgs, [12, { serverId: 3 }, true])
        assert.strictEqual((hashExports.UserState as any).getRedisKey(12), 'UserState_12')

        const hashJson = transformFixture({
            relativeFile: 'runtime/Stage.ts',
            source: `
                import { ServerHashJson } from '@arthropoda/game-engine'
                export class Stage extends ServerHashJson {
                    id: int = 0
                    getNotifyUids() { return [this.id] }
                }
            `,
            record: beanRecord(
                'Stage',
                '/runtime/Stage',
                { id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }) },
                { diffType: 3, extendType: 'ServerHashJson', idFiledType: 'int' },
            ),
        })
        const jsonExports = executeCommonJs(hashJson.js, engine) as { Stage: new (...args: any[]) => any }
        const stage = new jsonExports.Stage(5, 'season', { serverId: 2 }, false)
        assert.deepStrictEqual(stage.baseArgs, [5, 'season', { serverId: 2 }, false])
        assert.strictEqual(stage.rootKey, 'season')
        assert.deepStrictEqual(stage.getNotifyUids(), [5])
        assert.strictEqual((jsonExports.Stage as any).getRedisKey('season'), 'Stage_season')
    })

    it('按 record 生成 OnlyNet/OnlyRedis/Mod/ClassNetMap/Listen 元数据', () => {
        const engine = createEngineMock()
        const mapState = transformFixture({
            relativeFile: 'runtime/DecoratedState.ts',
            source: `
                import { UserHash, DiffMap, ClassNetMap, OnlyNet, OnlyRedis, Mod, Listen } from '@arthropoda/game-engine'
                class ListenHandler {}

                @ClassNetMap
                @OnlyNet
                export class DecoratedState extends UserHash {
                    id: int = 0

                    @OnlyRedis
                    secret: string = ''

                    @Listen(ListenHandler)
                    score: int = 0

                    @Mod
                    children?: DiffMap<int, int>
                }
            `,
            record: beanRecord(
                'DecoratedState',
                '/runtime/DecoratedState',
                {
                    id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }),
                    secret: fieldRecord(2, 'secret', 'string', 'string', "''", {
                        defaultValue: "''",
                        decorators: ['@OnlyRedis'],
                        saveType: 'SaveType.ForRedis',
                    }),
                    score: fieldRecord(3, 'score', 'int', 'int', '0', {
                        defaultValue: '0',
                        decorators: ['@Listen(ListenHandler)'],
                        listen: 'ListenHandler',
                    }),
                    children: fieldRecord(4, 'children', 'Map', 'DiffMap<int, int>', null, {
                        optional: true,
                        decorators: ['@Mod'],
                        collectionTypes: ['int', 'int'],
                        modType: 'ModType.ModMap',
                    }),
                },
                {
                    diffType: 2,
                    extendType: 'UserHash',
                    idFiledType: 'int',
                    decorators: ['@ClassNetMap', '@OnlyNet'],
                    saveType: 'SaveType.All - SaveType.ForRedis',
                    modType: 'ModType.ModMap',
                    modId: 41,
                    initFunc: true,
                },
            ),
        })
        const mapExports = executeCommonJs(mapState.js, engine) as { DecoratedState: new (...args: any[]) => any }
        const classInfo = (mapExports.DecoratedState as any)._class_info
        assert.strictEqual(classInfo.name, 'DecoratedState')
        assert.strictEqual(classInfo.modId, 41)
        assert.strictEqual(classInfo.saveType, engine.SaveType.ForNet)
        assert.strictEqual(classInfo.modType, engine.ModType.ModMap)
        assert.strictEqual((mapExports.DecoratedState as any).f_secret.saveType, engine.SaveType.ForRedis)
        assert.strictEqual((mapExports.DecoratedState as any).f_score.listenHandle.name, 'ListenHandler')
        assert.strictEqual((mapExports.DecoratedState as any).f_children.modType, engine.ModType.ModMap)

        const modState = transformFixture({
            relativeFile: 'runtime/ModState.ts',
            source: `
                import { UserHash, Mod } from '@arthropoda/game-engine'
                @Mod
                export class ModState extends UserHash { id: int = 0 }
            `,
            record: beanRecord(
                'ModState',
                '/runtime/ModState',
                { id: fieldRecord(1, 'id', 'int', 'int', '0', { defaultValue: '0' }) },
                {
                    diffType: 2,
                    extendType: 'UserHash',
                    idFiledType: 'int',
                    decorators: ['@Mod'],
                    modType: 'ModType.ModBean',
                    modId: 42,
                },
            ),
        })
        const modExports = executeCommonJs(modState.js, engine) as { ModState: new (...args: any[]) => any }
        assert.strictEqual((modExports.ModState as any)._class_info.modType, engine.ModType.ModBean)

        const listenBean = transformFixture({
            relativeFile: 'runtime/ListenBean.ts',
            source: `
                import { Bean, Listen } from '@arthropoda/game-engine'
                class ListenHandler {}
                export class ListenBean extends Bean {
                    @Listen(ListenHandler)
                    value: int = 0
                }
            `,
            record: beanRecord('ListenBean', '/runtime/ListenBean', {
                value: fieldRecord(1, 'value', 'int', 'int', '0', {
                    defaultValue: '0',
                    decorators: ['@Listen(ListenHandler)'],
                    listen: 'ListenHandler',
                }),
            }),
        })
        const listenExports = executeCommonJs(listenBean.js, engine) as { ListenBean: new (...args: any[]) => any }
        assert.strictEqual((listenExports.ListenBean as any).f_value.listenHandle.name, 'ListenHandler')
    })
})

function transformFixture(fixture: TransformFixture): { ts: string; js: string } {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-bean-compile-'))
    temporaryRoots.push(projectRoot)
    const relativeFile = fixture.relativeFile ?? 'SampleBean.ts'
    const fileName = path.join(projectRoot, fixture.sourceRelativeFile ?? path.join('src/bean', relativeFile))
    fs.mkdirSync(path.dirname(fileName), { recursive: true })
    fs.mkdirSync(path.join(projectRoot, 'generated/records'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, 'generated/records/record.json'), JSON.stringify(fixture.record))

    const sourceFile = ts.createSourceFile(fileName, fixture.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const transformed = ts.transform(sourceFile, [createBeanCompileTransformer({ projectRoot })])
    const printed = ts.createPrinter().printFile(transformed.transformed[0] as ts.SourceFile)
    transformed.dispose()
    const js = ts.transpileModule(fixture.source, {
        fileName,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        transformers: { before: [createBeanCompileTransformer({ projectRoot })] },
    }).outputText
    return { ts: printed, js }
}

function beanRecord(
    name: string,
    relativePath: string,
    properties: Record<string, object>,
    overrides: Record<string, unknown> = {},
) {
    return {
        beans: {
            [`${name}.ts`]: {
                relativePath,
                name,
                className: name,
                diffType: 1,
                extendType: 'Bean',
                decorators: [],
                modId: 0,
                saveType: 'SaveType.All',
                modType: 'ModType.None',
                initFunc: false,
                properties,
                ...overrides,
            },
        },
    }
}

function fieldRecord(
    id: number,
    name: string,
    type: string,
    sourceType: string,
    sourceInitializer: string | null,
    overrides: {
        defaultValue?: string
        optional?: boolean
        decorators?: string[]
        collectionTypes?: string[]
        saveType?: string
        modType?: string
        listen?: string
    } = {},
) {
    return {
        id,
        name,
        type,
        sourceType,
        sourceInitializer,
        hasQuestionToken: overrides.optional ?? false,
        decorators: overrides.decorators ?? [],
        collectionTypes: overrides.collectionTypes,
        defaultValue: overrides.defaultValue,
        typeImport: '',
        saveType: overrides.saveType ?? 'SaveType.All',
        modType: overrides.modType ?? 'ModType.None',
        listen: overrides.listen ?? 'undefined',
    }
}

function executeCommonJs(output: string, engine: Record<string, any>): unknown {
    const module = { exports: {} as Record<string, unknown> }
    const load = (specifier: string) => {
        if (specifier === '@arthropoda/game-engine') return engine
        throw new Error(`unexpected module: ${specifier}`)
    }
    new Function('require', 'module', 'exports', output)(load, module, module.exports)
    return module.exports
}

function createEngineMock() {
    const SaveType = { ForRedis: 1, ForNet: 2, All: 3 }
    const ModType = { None: 0, ModBean: 1, ModMap: 2 }
    const BeanStatus = { AutoInit: 1 }
    const FieldStatus = { Update: 1, Delete: 2 }

    class FieldInfo {
        classInfo: any
        name: string
        index: number
        type: any
        defaultVal?: any
        collectionType?: any
        saveType: number
        modType: number
        listenHandle?: Function

        constructor(
            classInfo: any,
            name: string,
            index: number,
            type: any,
            defaultVal?: any,
            collectionType?: any,
            saveType = SaveType.All,
            modType = ModType.None,
            listenHandle?: Function,
        ) {
            this.classInfo = classInfo
            this.name = name
            this.index = index
            this.type = type
            this.defaultVal = defaultVal
            this.collectionType = collectionType
            this.saveType = saveType
            this.modType = modType
            this.listenHandle = listenHandle
        }
    }
    class ClassInfo {
        fields: FieldInfo[] = []
        fieldMap: Record<string, FieldInfo> = {}
        name: string
        constrFunc: Function
        modId: number
        saveType: number
        modType: number

        constructor(name: string, constrFunc: Function, modId = 0, saveType = SaveType.All, modType = ModType.None) {
            this.name = name
            this.constrFunc = constrFunc
            this.modId = modId
            this.saveType = saveType
            this.modType = modType
        }
        addField(field: FieldInfo) {
            this.fields.push(field)
            this.fieldMap[field.name] = field
        }
    }
    class Bean {
        changes: object[] = []
        writable = true
        diff?: object
        onChange(field: FieldInfo, status: number, oldVal?: unknown) {
            this.changes.push({ field: field.name, status, oldVal })
        }
        assertWritable() {
            if (!this.writable) {
                throw new Error('the Bean cannot be written')
            }
        }
        _buildNet(data: Record<string, unknown>) {
            Object.assign(this, data)
        }
    }
    class Hash extends Bean {
        static _class_info?: ClassInfo
        baseArgs: unknown[]
        loads: string[] = []
        constructor(id: unknown, loadOpts?: unknown, byLoad = false) {
            super()
            this.baseArgs = [id, loadOpts, byLoad]
        }
        tryLoad(field: string) {
            this.loads.push(field)
        }
        static getRedisKey(id?: unknown) {
            return id === undefined ? this._class_info!.name : `${this._class_info!.name}_${id}`
        }
    }
    class HashJson extends Bean {
        static _class_info?: ClassInfo
        baseArgs: unknown[]
        rootKey?: string
        loads: string[] = []
        constructor(id: unknown, rootKey?: string, loadOpts?: unknown, byLoad = false) {
            super()
            this.rootKey = rootKey
            this.baseArgs = [id, rootKey, loadOpts, byLoad]
        }
        tryLoad(field: string) {
            this.loads.push(field)
        }
        static getRedisKey(rootKey?: string) {
            return rootKey === undefined ? this._class_info!.name : `${this._class_info!.name}_${rootKey}`
        }
    }
    class DiffArray<T> extends Array<T> {
        static _class_info = { name: 'DiffArray' }
        initArgs: unknown[] = []
        field: FieldInfo
        constructor(field: FieldInfo, ...values: T[]) {
            super()
            this.field = field
            this.push(...values)
        }
        initDiff(...args: unknown[]) {
            this.initArgs = args
        }
    }
    class DiffMap<K, V> extends Map<K, V> {
        static _class_info = { name: 'DiffMap' }
        initArgs: unknown[] = []
        field: FieldInfo
        constructor(field: FieldInfo) {
            super()
            this.field = field
        }
        initDiff(...args: unknown[]) {
            this.initArgs = args
        }
        parseFromData(data: Record<string, V>) {
            for (const [key, value] of Object.entries(data)) this.set(key as K, value)
        }
    }
    const decorator = () => undefined
    return {
        SaveType,
        ModType,
        BeanStatus,
        FieldStatus,
        FieldInfo,
        ClassInfo,
        Bean,
        Hash,
        UserHash: Hash,
        ServerHash: Hash,
        CenterHash: Hash,
        HashJson,
        UserHashJson: HashJson,
        ServerHashJson: HashJson,
        CenterHashJson: HashJson,
        DiffArray,
        DiffMap,
        OnlyNet: decorator,
        OnlyRedis: decorator,
        Mod: decorator,
        ClassNetMap: decorator,
        Listen: decorator,
    }
}
