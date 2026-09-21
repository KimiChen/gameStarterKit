import assert from 'node:assert/strict'
import { CopperIncome } from '../../../src/modules/user/action/CopperIncome'
import type { User } from '../../../src/modules/user/bean/User'

/**
 * 只提供 `CopperIncome` 真正读写的字段。⛔ 不构造完整 Bean：那会把 Redis / 装饰器拉进纯规则测试，
 * 让「规则算错了」和「存储没配好」两种失败混在一起。
 */
type CopperFields = 'lv' | 'copper' | 'lastCopperIncomeTime' | 'offlineCopperPending' | 'offlineCopperSecondsPending'

function beanOf(fields: Partial<Pick<User, CopperFields>>): User {
    return {
        lv: 0,
        copper: 0,
        lastCopperIncomeTime: 0,
        offlineCopperPending: 0,
        offlineCopperSecondsPending: 0,
        ...fields,
    } as unknown as User
}

describe('CopperIncome 规则', () => {
    it('keeps the 每 5 秒 100 × 等级^1.1 rule', () => {
        assert.equal(CopperIncome.INTERVAL_SECONDS, 5)
        assert.equal(CopperIncome.perInterval(0), 0)
        assert.equal(CopperIncome.perInterval(1), 100)
        assert.equal(CopperIncome.perInterval(3), 334)
        assert.equal(CopperIncome.perInterval(10), 1258)
        assert.equal(CopperIncome.perInterval(50), 7393)
    })

    it('parks offline income without crediting it, and advancing the baseline blocks double counting', () => {
        const user = beanOf({ lv: 3, copper: 1000, lastCopperIncomeTime: 100 })

        assert.deepEqual(CopperIncome.parkOffline(user, 220), { offlineSeconds: 120, copper: 8016 })
        // 本次改动的核心断言：登录只暂存，⛔ 不进 copper —— 否则「客户端请求才发放」就没有意义。
        assert.equal(user.copper, 1000)
        assert.equal(user.offlineCopperPending, 8016)
        assert.equal(user.offlineCopperSecondsPending, 120)
        assert.equal(user.lastCopperIncomeTime, 220)

        // 基线已推到登录时刻 ⇒ 在线结算不会把同一段离线时间再算一遍（重复计息的唯一入口就在这里）。
        assert.equal(CopperIncome.settleOnline(user, 224), 0)
        assert.equal(user.copper, 1000)
        assert.equal(CopperIncome.settleOnline(user, 230), 668)
        assert.equal(user.copper, 1668)
    })

    it('accumulates unclaimed offline income across logins instead of dropping it', () => {
        const user = beanOf({ lv: 1, lastCopperIncomeTime: 100 })
        CopperIncome.parkOffline(user, 110) // 10s → 2 个周期 → 200
        CopperIncome.markOffline(user, 200) // 断线，离线起点 200
        CopperIncome.parkOffline(user, 215) // 15s → 3 个周期 → 300

        assert.equal(user.offlineCopperPending, 500)
        assert.equal(user.offlineCopperSecondsPending, 25)
        assert.equal(user.copper, 0)
    })

    it('grants offline income only on claim, and a second claim grants nothing', () => {
        const user = beanOf({ lv: 1, copper: 7, lastCopperIncomeTime: 100 })
        CopperIncome.parkOffline(user, 110)

        // 预览是只读的：查一次不能让待领收益变成已到账。
        assert.deepEqual(CopperIncome.pendingOffline(user), { offlineSeconds: 10, copper: 200 })
        assert.equal(user.copper, 7)

        assert.deepEqual(CopperIncome.claimOffline(user), { offlineSeconds: 10, copper: 200 })
        assert.equal(user.copper, 207)
        assert.deepEqual(CopperIncome.pendingOffline(user), { offlineSeconds: 0, copper: 0 })

        // 暂存已清零：第二次领取拿不到第二笔钱。
        assert.deepEqual(CopperIncome.claimOffline(user), { offlineSeconds: 0, copper: 0 })
        assert.equal(user.copper, 207)
    })

    it('does not invent offline income on the very first login', () => {
        const user = beanOf({ lv: 9, copper: 5 })
        assert.deepEqual(CopperIncome.parkOffline(user, 1000), { offlineSeconds: 0, copper: 0 })
        assert.equal(user.offlineCopperPending, 0)
        assert.equal(user.copper, 5)
    })

    it('keeps the sub-interval remainder on the online baseline', () => {
        const user = beanOf({ lv: 1, lastCopperIncomeTime: 100 })

        assert.equal(CopperIncome.settleOnline(user, 107), 100) // 7s → 1 个周期
        assert.equal(user.lastCopperIncomeTime, 105) // 2s 余量保留
        assert.equal(CopperIncome.settleOnline(user, 108), 0) // 余量仍不足一个周期
        assert.equal(CopperIncome.settleOnline(user, 110), 100) // 105 → 110 又凑满一个周期
        assert.equal(user.lastCopperIncomeTime, 110)
    })
})
