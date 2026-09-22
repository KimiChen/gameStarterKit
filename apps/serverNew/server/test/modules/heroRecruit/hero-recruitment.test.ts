import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DiffArray } from '@arthropoda/game-engine'
import type { IHeroRecruitBuyRes } from '../../../generated/lobby-contract/protocol/lobbyRpc/domains/heroRecruit'
import { ActionHeroRecruitBuy } from '../../../src/modules/heroRecruit/action/ActionHeroRecruitBuy'
import type { User } from '../../../src/modules/user/bean/User'

function user(copper: number, owned: number[] = []): User {
    return {
        copper,
        recruitedHeroIds: new DiffArray(undefined, ...owned),
    } as User
}

class TestHeroRecruitBuyAction extends ActionHeroRecruitBuy {
    constructor(value: User) {
        super()
        this._user = value
    }
}

test('heroRecruit：目录从 shared 读取，购买原子扣除铜币并写入英雄归属', async () => {
    const value = user(1_000)
    const result = {} as IHeroRecruitBuyRes
    await new TestHeroRecruitBuyAction(value).doAction({ clientReqId: 'buy-1', heroId: 1001 }, result)
    assert.equal(result.purchasedHeroId, 1001)
    assert.equal(result.snapshot.copper, 500)
    assert.deepEqual(result.snapshot.ownedHeroIds, [1001])
    assert.equal(result.snapshot.catalog[0]?.copperPrice, 500)
})

test('heroRecruit：未知、重复与余额不足均不改变玩家状态', async () => {
    const value = user(499, [1002])
    for (const [heroId, code] of [
        [9999, 'HERO_RECRUIT_UNKNOWN'],
        [1002, 'HERO_RECRUIT_ALREADY_OWNED'],
        [1001, 'HERO_RECRUIT_INSUFFICIENT_COPPER'],
    ] as const) {
        await assert.rejects(
            () =>
                new TestHeroRecruitBuyAction(value).doAction(
                    { clientReqId: `buy-${heroId}`, heroId },
                    {} as IHeroRecruitBuyRes,
                ),
            (error: { code: string }) => error.code === code,
        )
    }
    assert.equal(value.copper, 499)
    assert.deepEqual([...value.recruitedHeroIds!], [1002])
})
