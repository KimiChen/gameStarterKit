import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
    BeanStatus,
    DiffArray,
    DiffMap,
    E_APP_TYPE,
    FieldStatus,
    ModType,
    RefHash,
    SaveType,
    convertToBase52,
} from '@arthropoda/game-engine'
import { ContextEngine as RuntimeContextEngine } from '../../../alloy-engine/src/context/ContextEngine'
import { Props } from '../../src/modules/props/inventory/Props'
import { HeroBean } from '../../src/modules/test/bean/HeroBean'
import { TestBean1 } from '../../src/modules/test/bean/TestBean1'
import { User } from '../../src/modules/user/bean/User'
import { GuildMemberRef } from '../../src/modules/guild/ref/GuildMemberRef'
import { GuildRef } from '../../src/modules/guild/ref/GuildRef'
import { RankGuildRef } from '../../src/modules/rank/ref/RankGuildRef'
import { RankUserRef } from '../../src/modules/rank/ref/RankUserRef'
import { UserBaseRef } from '../../src/modules/user/ref/UserBaseRef'
import { UserEquipRef } from '../../src/modules/equip/ref/UserEquipRef'
import { RedDotBean } from '../../src/modules/reddot/bean/RedDotBean'
import { HashJsonNetTestBean } from '../../src/modules/test/bean/HashJsonNetTestBean'
import { HashMapTestBean } from '../../src/modules/test/bean/HashMapTestBean'
import { UserHashTestBean } from '../../src/modules/test/bean/UserHashTestBean'
import { TimesBean } from '../../src/modules/user/bean/TimesBean'
import { UserTempBean } from '../../src/modules/user/bean/UserTempBean'
import { ItemIdDefine } from '../../src/modules/props/rules/ItemIdDefine'
import { GenerationPaths } from '../../scripts/generator/GenerationPaths'

const beanSourceByLogicalPath = new Map(
    new GenerationPaths(process.cwd()).discoverBeanSources().map((source) => [source.logicalPath, source.filePath]),
)

function beanRuntimeModule(relativePath: string) {
    const sourcePath = beanSourceByLogicalPath.get(relativePath)
    if (sourcePath) {
        const relativeSource = path
            .relative(process.cwd(), sourcePath)
            .split(path.sep)
            .join('/')
            .replace(/\.tsx?$/, '')
        return `../../${relativeSource}`
    }
    const logicalPath = relativePath.replace(/^\//, '')
    return `../../src/bean/${logicalPath}`
}

describe('Bean 真实运行时等价性（无 Redis）', () => {
    before(() => {
        ;(globalThis as any).APP_TYPE = E_APP_TYPE.API
    })

    it('保持 Bean truthy/falsy、int、NaN、oldVal、保存和网络数据语义', () => {
        const falsy = new TestBean1({ id: 0, val: 0, testPower: 0 })
        assert.strictEqual(falsy.id, 0)
        assert.strictEqual(falsy.val, 0)
        assert.strictEqual(falsy.testPower, 1000)

        const bean = new TestBean1({ id: 3.9, val: 2.7, testPower: 20.8 })
        assert.strictEqual(bean.constructor.name, 'TestBean1')
        assert.strictEqual(TestBean1._class_info.name, 'TestBean1')
        assert.strictEqual(bean.id, 3)
        assert.strictEqual(bean.val, 2)
        assert.strictEqual(bean.testPower, 20)

        let change: { name: string; status: FieldStatus; oldVal: unknown } | undefined
        const originalOnChange = bean.onChange.bind(bean)
        bean.onChange = (field, status, oldVal) => {
            change = {
                name: typeof field === 'object' ? field.name : String(field),
                status,
                oldVal,
            }
            originalOnChange(field, status, oldVal)
        }
        bean.initDiff()
        bean.val = 8.9
        assert.strictEqual(bean.val, 8)
        assert.deepStrictEqual(change, { name: 'val', status: FieldStatus.Update, oldVal: 2 })
        assert.throws(() => {
            bean.val = Number.NaN
        }, /is not a number or NaN/)

        const saveData = bean.toSaveData()!
        assert.strictEqual(saveData[TestBean1.f_id.aliasName], 3)
        assert.strictEqual(saveData[TestBean1.f_val.aliasName], 8)
        assert.strictEqual(saveData[TestBean1.f_testPower.aliasName], undefined)
        assert.deepStrictEqual(bean.toModData(), { id: 3, val: 8, testPower: 20 })
    })

    it('保持真实嵌套 Bean、DiffArray、DiffMap 延迟构造和装饰器元数据', () => {
        const arrayBean = new RedDotBean()
        assert(arrayBean.extraIds instanceof DiffArray)
        assert.strictEqual((arrayBean.extraIds as any).diff.parent, arrayBean)
        assert.strictEqual((arrayBean.extraIds as any).diff.field, RedDotBean.f_extraIds)

        const parsedArrayBean = new RedDotBean()
        ;(parsedArrayBean as any)._extraIds = [2, 4]
        assert.deepStrictEqual(Array.from(parsedArrayBean.extraIds!), [2, 4])

        const hash = new UserHashTestBean(31, undefined, true)
        assert(hash.attrs instanceof DiffMap)
        assert.strictEqual((hash.attrs as any).diff.parent, hash)
        assert.strictEqual((hash.attrs as any).diff.field, UserHashTestBean.f_attrs)

        ;(hash as any)._hero = JSON.stringify({
            [HeroBean.f_hId.aliasName]: 7,
            [HeroBean.f_lv.aliasName]: 9,
        })
        assert.strictEqual(hash.hero!.hId, 7)
        assert.strictEqual(hash.hero!.lv, 9)
        assert.strictEqual((hash.hero as any).diff.parent, hash)
        assert.strictEqual((hash.hero as any).diff.field, UserHashTestBean.f_hero)

        assert.strictEqual(TestBean1.f_testPower.saveType, SaveType.ForNet)
        assert.strictEqual(UserHashTestBean.f_deviceId.saveType, SaveType.ForRedis)
        assert.strictEqual(HashMapTestBean._class_info.modId, 304)
        assert.strictEqual(HashMapTestBean._class_info.modType, ModType.ModMap)
        assert.strictEqual(TimesBean.f_times.listenHandle?.name, 'ListenTimesHandler')
    })

    it('保持 Hash key、load/loadOnlyRead、buildDissociate、loadOpts 和上下文缓存注册', async () => {
        const originalGetRedis = (UserTempBean as any).getRedis
        const redis = new HashRedisStub()
        ;(UserTempBean as any).getRedis = () => redis
        try {
            await withRuntimeContext(async (context) => {
                const direct = new UserTempBean(7, { serverId: 3 })
                assert.strictEqual(direct.constructor.name, 'UserTempBean')
                assert.strictEqual(UserTempBean._class_info.name, 'UserTempBean')
                assert.strictEqual(UserTempBean.getRedisKey(7, 3), '3:UserTempBean_7')
                assert.strictEqual(context.loadedHash.get('3:UserTempBean_7'), direct)
                assert.strictEqual(direct.expireTime(), 30 * 86400)

                redis.hashes.set('3:UserTempBean_9', { id: '9', chatTime: '12' })
                const loadOpts = { serverId: 3, fields: ['chatTime'] }
                const loaded = await UserTempBean.load(9, loadOpts)
                assert(loaded)
                assert.strictEqual(loaded.chatTime, 12)
                assert.deepStrictEqual(loadOpts.fields, ['chatTime', 'id'])
                assert.strictEqual(context.loadedHash.get('3:UserTempBean_9'), loaded)
                assert.strictEqual(await UserTempBean.load(9, { serverId: 3 }), loaded)

                redis.hashes.set('3:UserTempBean_10', { id: '10', guildChatTime: '13' })
                const readOnly = await UserTempBean.loadOnlyRead(10, { serverId: 3 })
                assert(readOnly)
                assert.strictEqual(readOnly.guildChatTime, 13)
                assert.strictEqual((readOnly as any).writable, false)
                assert.throws(() => {
                    ;(readOnly as any).guildChatTime = 14
                }, /cannot be written/)
                assert.strictEqual(readOnly.guildChatTime, 13)
                assert.strictEqual(context.loadedHash.has('3:UserTempBean_10'), false)

                const dissociate = UserTempBean.buildDissociate({ diffStatus: BeanStatus.None })
                assert.strictEqual(dissociate._getDiff().status, BeanStatus.None)
                assert.strictEqual(context.loadedHash.has('UserTempBean_0'), false)
            })
        } finally {
            ;(UserTempBean as any).getRedis = originalGetRedis
        }
    })

    it('保持 HashJson rootKey、加载、保存、删除、通知和缓存注册', async () => {
        const originalGetRedis = (HashJsonNetTestBean as any).getRedis
        const redis = new HashJsonRedisStub()
        ;(HashJsonNetTestBean as any).getRedis = () => redis
        try {
            await withRuntimeContext(async (context) => {
                const bean = new HashJsonNetTestBean(11, 'season', { serverId: 4 })
                assert.strictEqual(bean.constructor.name, 'HashJsonNetTestBean')
                assert.strictEqual(HashJsonNetTestBean._class_info.name, 'HashJsonNetTestBean')
                assert.strictEqual(bean.rootKey, 'season')
                assert.strictEqual(HashJsonNetTestBean.getRedisKey('season', 4), '4:HashJsonNetTestBean_season')
                assert.strictEqual(context.loadedHashJson.get('4:HashJsonNetTestBean_season')?.get(11), bean)
                assert.deepStrictEqual(bean.getNotifyUids(), [11])

                bean.exp = 18
                bean.lv = 3
                const saveData = bean.toSaveData()!
                assert.strictEqual(saveData[HashJsonNetTestBean.f_exp.aliasName], 18)
                assert.strictEqual(saveData[HashJsonNetTestBean.f_lv.aliasName], 3)
                assert.strictEqual(saveData.id, undefined)
                assert.deepStrictEqual(bean.toModData(), { id: 11, exp: 18, lv: 3 })
                assert.strictEqual(await bean.save(redis as any), 1)
                const saved = JSON.parse(redis.hashes.get('4:HashJsonNetTestBean_season')!.get('11')!)
                assert.strictEqual(saved[HashJsonNetTestBean.f_exp.aliasName], 18)
                assert.strictEqual(saved[HashJsonNetTestBean.f_lv.aliasName], 3)
                assert.strictEqual(saved.id, 11)

                const stored = {
                    id: 15,
                    [HashJsonNetTestBean.f_exp.aliasName]: 21,
                    [HashJsonNetTestBean.f_lv.aliasName]: 4,
                }
                redis.hashes.set('4:HashJsonNetTestBean_archive', new Map([['15', JSON.stringify(stored)]]))
                const loaded = await HashJsonNetTestBean.load(15, 'archive', { serverId: 4 })
                assert(loaded)
                assert.strictEqual(loaded.exp, 21)
                assert.strictEqual(loaded.lv, 4)
                assert.strictEqual(loaded.rootKey, 'archive')
                assert.strictEqual(context.loadedHashJson.get('4:HashJsonNetTestBean_archive')?.get(15), loaded)

                bean.delete()
                assert.strictEqual(bean.toSaveData(), undefined)
                assert.strictEqual(await bean.save(redis as any), 1)
                assert.strictEqual(redis.hashes.get('4:HashJsonNetTestBean_season')?.has('11'), false)
            })
        } finally {
            ;(HashJsonNetTestBean as any).getRedis = originalGetRedis
        }
    })

    it('在 Ref 类初始化时按来源类和字符串路径注册真实直接/嵌套 FromData', () => {
        const userClassInfo = (User as any)._class_info
        const userFields = RefHash._infos.UserBaseRef.fieldMaps.User.fieldMaps
        assert.strictEqual(userFields.id.fromField, userClassInfo.fieldMap.id)
        assert.strictEqual(userFields.labelWears.fromField.parentField, userClassInfo.fieldMap.achieve)
        assert.strictEqual(userFields.weaponLv.fromField.parentField, userClassInfo.fieldMap.weapon)
    })

    it('逐类校验运行时 ClassInfo 和 FieldInfo 与 record 一致', () => {
        const recordPath = path.resolve('generated/records/record.json')
        const record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as {
            beans: Record<string, any>
        }
        const beanRecords = Object.values(record.beans).filter((beanRecord: any) => !beanRecord.deleted) as any[]
        const expectedClassCount = beanRecords.filter((beanRecord) => beanRecord.diffType !== 0).length
        const expectedFieldCount = beanRecords.reduce(
            (count, beanRecord) =>
                beanRecord.diffType === 0
                    ? count
                    : count + Object.values(beanRecord.properties).filter((field: any) => !field.deleted).length,
            0,
        )
        let classCount = 0
        let fieldCount = 0

        for (const beanRecord of beanRecords) {
            const beanModule = require(beanRuntimeModule(beanRecord.relativePath)) as Record<string, any>
            const className = beanRecord.className ?? beanRecord.name
            const beanClass = beanModule[className]
            assert(beanClass, beanRecord.relativePath)

            if (beanRecord.diffType === 0) {
                assert.strictEqual(Object.prototype.hasOwnProperty.call(beanClass, '_class_info'), false)
                continue
            }

            classCount++
            const classInfo = beanClass._class_info
            const expectedFields = Object.values(beanRecord.properties).filter((field: any) => !field.deleted) as any[]
            assert.strictEqual(beanClass.name, className)
            assert.strictEqual(classInfo.name, className)
            assert.strictEqual(classInfo.constrFunc, beanClass)
            assert.strictEqual(classInfo.modName, className[0].toLowerCase() + className.slice(1))
            assert.strictEqual(classInfo.modId, beanRecord.modId)
            assert.strictEqual(classInfo.saveType, runtimeEnumValue(beanRecord.saveType))
            assert.strictEqual(classInfo.modType, runtimeEnumValue(beanRecord.modType))
            assert.deepStrictEqual(
                classInfo.fields.map((field: any) => field.name),
                expectedFields.map((field) => field.name),
            )

            for (const fieldRecord of expectedFields) {
                fieldCount++
                const fieldInfo = classInfo.fieldMap[fieldRecord.name]
                assert(fieldInfo, `${className}.${fieldRecord.name}`)
                assert.strictEqual(fieldInfo.index, fieldRecord.id)
                assert.strictEqual(fieldInfo.aliasName, convertToBase52(fieldRecord.id))
                assert.strictEqual(fieldInfo.saveType, runtimeEnumValue(fieldRecord.saveType))
                assert.strictEqual(fieldInfo.modType, runtimeEnumValue(fieldRecord.modType))
                assert.strictEqual(fieldInfo.listenHandle?.name ?? 'undefined', fieldRecord.listen)
            }
        }

        assert.strictEqual(classCount, expectedClassCount)
        assert.strictEqual(fieldCount, expectedFieldCount)
    })

    it('由 Props 功能常量解析单层和嵌套路径', () => {
        const user = { gc: 5, gong: { mgPoint: 7 } }
        const resolvePath = (Props as any).resolveUserFieldPath as (
            value: object,
            fieldPath: string,
        ) => { fieldOwner: Record<string, number>; fieldName: string }
        const direct = resolvePath(user, ItemIdDefine.USER_FIELD_PATH.gc)
        direct.fieldOwner[direct.fieldName] += 2
        const nested = resolvePath(user, ItemIdDefine.USER_FIELD_PATH.mgPoint)
        nested.fieldOwner[nested.fieldName] += 3
        assert.deepStrictEqual(user, { gc: 7, gong: { mgPoint: 10 } })
        assert.strictEqual(ItemIdDefine.getUserFieldCashMap(ItemIdDefine.ITEM_ID_GC), 'gc')
        assert.strictEqual(ItemIdDefine.getUserFieldCashMap(ItemIdDefine.ITEM_ID_YS), 'gong.mgPoint')
        assert.strictEqual(ItemIdDefine.ITEM_TYPE_FIELD_MAP[ItemIdDefine.ITEM_TYPE_RARE], 'rares')
        assert.strictEqual(ItemIdDefine.ITEM_TYPE_FIELD_MAP[ItemIdDefine.ITEM_TYPE_MAGIC], 'magics')
        assert.strictEqual(ItemIdDefine.ITEM_TYPE_FIELD_MAP[ItemIdDefine.ITEM_TYPE_FASHION], 'fashions')
    })
})

async function withRuntimeContext<T>(run: (context: RuntimeContextEngine) => Promise<T>): Promise<T> {
    const context = new RuntimeContextEngine()
    return RuntimeContextEngine.asyncLocalStorage.run(context, () => run(context))
}

function runtimeEnumValue(expression: string): number {
    return Function('SaveType', 'ModType', `return ${expression}`)(SaveType, ModType)
}

class HashRedisStub {
    hashes = new Map<string, Record<string, string>>()

    async hGetAll(key: string) {
        return this.hashes.get(key) ?? {}
    }

    async hmGetToMap(key: string, fields: string[]) {
        const source = this.hashes.get(key) ?? {}
        return Object.fromEntries(
            fields.flatMap((field) => (source[field] === undefined ? [] : [[field, source[field]]])),
        )
    }
}

class HashJsonRedisStub {
    hashes = new Map<string, Map<string, string>>()

    async hmGet(key: string, ids: Array<number | string>) {
        const source = this.hashes.get(key) ?? new Map<string, string>()
        return ids.map((id) => source.get(String(id)) ?? null)
    }

    async hGetAll(key: string) {
        return Object.fromEntries(this.hashes.get(key) ?? [])
    }

    async hSet(key: string, id: string, value: string) {
        let values = this.hashes.get(key)
        if (!values) this.hashes.set(key, (values = new Map()))
        values.set(id, value)
    }

    async hDel(key: string, id: string) {
        this.hashes.get(key)?.delete(id)
    }

    async del(key: string) {
        this.hashes.delete(key)
    }

    async expire() {}
}
