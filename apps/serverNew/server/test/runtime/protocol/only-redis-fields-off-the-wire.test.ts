import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { BeanStatus, ModSync } from '@arthropoda/game-engine'
import { User } from '../../../src/modules/user/bean/User'
import { DifferCache, getDifferCache } from '../../../../engine/src/differ/differCache'

/**
 * BF8 的客户端不变量：`@OnlyRedis` 字段**永远不出现在同步载荷里**。
 *
 * 客户端的 `LobbyDataSyncStore` 对模块数据是**透明**的（不建字段表、不解释语义），所以
 * 「内部字段不上网」这条保证只能在服务端装配处成立 —— 也就是 `ModSync.autoGetModChanged()`：
 * 它是 `reply.sync` 与主动 sync 帧的唯一装配器（`SyncReceiptTask.onActionSuccess` 消费它）。
 *
 * 这里用**生产编译出的 `User` Bean** 跑一遍真实装配：字段的 `SaveType` 来自
 * `generated/records/record.json` 经 bean-compile transformer 生成的 `FieldInfo`，
 * 隐藏字段清单也从同一份 record 派生 —— ⛔ 不手写第二份字段表，否则两边会各自漂移。
 *
 * 关键点：隐藏字段被赋了**非默认值**。`toFieldModData` 会跳过等于默认值的字段，所以若某个
 * 隐藏字段只是「碰巧还是 0」，它不上网就证明不了任何事；赋非默认值后，它缺席的唯一解释
 * 只能是 `FieldInfo.forNet` 那道闸（`saveType & SaveType.ForNet`）。
 */
describe('@OnlyRedis fields stay off the sync wire', () => {
    const projectRoot = process.cwd()

    interface RecordedField {
        readonly type: string
        readonly saveType: string
        readonly decorators?: readonly string[]
    }

    const userFields = (
        JSON.parse(fs.readFileSync(path.join(projectRoot, 'generated/records/record.json'), 'utf8')) as {
            readonly beans: Record<string, { readonly properties: Record<string, RecordedField> }>
        }
    ).beans['User.ts']!.properties

    /** 从 record 派生：所有被标记 `@OnlyRedis` 的字段名。 */
    const hiddenFieldNames = Object.entries(userFields)
        .filter(([, field]) => (field.decorators ?? []).includes('@OnlyRedis'))
        .map(([name]) => name)
        .sort()

    /** 可在测试里直接赋非默认值的隐藏字段（复杂类型留给「名字缺席」那条断言）。 */
    const primitiveHiddenFields = Object.entries(userFields)
        .filter(([name, field]) => hiddenFieldNames.includes(name) && ['int', 'string', 'boolean'].includes(field.type))
        .map(([name, field]) => ({ name, type: field.type }))

    const nonDefaultValueOf = (type: string): number | string | boolean =>
        type === 'int' ? 4242 : type === 'string' ? 'only-redis-secret' : true

    let savedGetCache: typeof getDifferCache
    let cache: DifferCache

    beforeEach(() => {
        savedGetCache = getDifferCache
        cache = new DifferCache()
        DifferCache.setGetCacheFun(() => cache)
    })

    afterEach(() => DifferCache.setGetCacheFun(savedGetCache))

    it('keeps every @OnlyRedis field out of the committed mod payload', () => {
        // 派生面本身要够厚，否则这条用例可能因为「没有隐藏字段」而假绿。
        assert.ok(hiddenFieldNames.length >= 3, `User Bean 的 @OnlyRedis 字段太少: ${hiddenFieldNames.join(', ')}`)
        assert.ok(
            ['lastCopperIncomeTime', 'offlineCopperPending', 'offlineCopperSecondsPending'].every((name) =>
                hiddenFieldNames.includes(name),
            ),
            'income 的三个内部字段必须仍在 @OnlyRedis 清单里',
        )
        assert.ok(primitiveHiddenFields.length >= 3, '至少要有几个可直接赋值的隐藏字段')

        const internalUid = 8801
        const user = new User(internalUid, undefined, true)
        // `diff` 是 protected（`Hash.load` 内部同样直接改它）；这里要的是「本次 Action 新建了
        // 这个 Bean」这一状态，让 `toModData(true)` 走完整字段遍历而不是只看 diff.changes。
        ;(user as unknown as { diff: { status: BeanStatus } }).diff.status = BeanStatus.New

        // 网络字段：必须出现在载荷里（正向对照，证明装配真的产出了数据）。
        user.copper = 100

        // 隐藏字段：全部赋非默认值，缺席才说明是 forNet 闸挡下的。
        for (const { name, type } of primitiveHiddenFields) {
            ;(user as unknown as Record<string, unknown>)[name] = nonDefaultValueOf(type)
        }
        cache.changedBeans.push(user)

        const payload = ModSync.autoGetModChanged()
        assert.ok(payload, '装配器必须产出变更（否则后面的断言全是空转）')

        const mods = payload[internalUid]
        assert.ok(mods, `载荷必须挂在内部 uid ${internalUid} 下`)

        const userMod = mods.user as Record<string, unknown>
        assert.ok(userMod, '载荷必须带 user 模块数据')
        assert.equal(userMod.copper, 100, '网络字段 copper 必须出现在载荷里')

        for (const name of hiddenFieldNames) {
            assert.equal(
                Object.prototype.hasOwnProperty.call(userMod, name),
                false,
                `${name} 是 @OnlyRedis，⛔ 不得出现在同步载荷里`,
            )
        }
    })
})
