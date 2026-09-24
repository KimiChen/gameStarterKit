import assert from 'node:assert/strict'
import { GAME_DEMO_CONFIG } from '../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import { GameDemoPlayer } from '../../../src/modules/gameDemo/bean/GameDemoPlayer'
import { GameDemoAlchemy } from '../../../src/modules/gameDemo/rules/GameDemoAlchemy'
import { GameDemoHeroTraining } from '../../../src/modules/gameDemo/rules/GameDemoHeroTraining'
import { GameDemoInventory } from '../../../src/modules/gameDemo/rules/GameDemoInventory'
import { GameDemoMailbox } from '../../../src/modules/gameDemo/rules/GameDemoMailbox'
import { GameDemoShop } from '../../../src/modules/gameDemo/rules/GameDemoShop'

const beforeMidnight = Date.parse('2026-09-22T15:59:59Z')
const afterMidnight = beforeMidnight + 1000

function player(values: Partial<Pick<GameDemoPlayer, 'herb' | 'dew' | 'pill' | 'finePill' | 'heroLevel'>> = {}) {
    const bean = new GameDemoPlayer(1001)
    bean.id = 1001
    bean.initialized = true
    Object.assign(bean, values)
    return bean
}

const code = (expected: string) => (error: { code?: string }) => error.code === expected

describe('gameDemo player rules', () => {
    it('reports gold from the host User copper and items from the player Bean', () => {
        assert.deepEqual(GameDemoInventory.assets({ copper: 42 }, undefined), {
            initialized: false,
            gold: 42,
            items: { herb: 0, dew: 0, pill: 0, finePill: 0 },
        })
        assert.deepEqual(GameDemoInventory.assets({ copper: 7 }, player({ herb: 3, pill: 2 })).items, {
            herb: 3,
            dew: 0,
            pill: 2,
            finePill: 0,
        })
    })

    it('charges copper per business day limit and resets the limit at UTC+8 midnight', () => {
        const user = { copper: 5000 }
        const bean = player()
        GameDemoShop.buy(user, bean, 'herb', 60, beforeMidnight)
        assert.equal(user.copper, 4400)
        assert.equal(bean.herb, 60)
        assert.throws(() => GameDemoShop.buy(user, bean, 'herb', 41, beforeMidnight), code('GAME_DEMO_LIMIT'))
        assert.deepEqual(GameDemoShop.purchased(bean, afterMidnight), { herb: 0, dew: 0 })
        GameDemoShop.buy(user, bean, 'herb', 41, afterMidnight)
        assert.equal(bean.herb, 101)
        assert.deepEqual(GameDemoShop.purchased(bean, afterMidnight), { herb: 41, dew: 0 })
    })

    it('rejects purchases the host copper cannot cover without touching the limit', () => {
        const user = { copper: 19 }
        const bean = player()
        assert.throws(() => GameDemoShop.buy(user, bean, 'dew', 1, beforeMidnight), code('GAME_DEMO_INSUFFICIENT_GOLD'))
        assert.equal(user.copper, 19)
        assert.equal(bean.dew, 0)
    })

    it('trains the hero with partial ten-pill batches and caps at max level', () => {
        const bean = player({ pill: 3 })
        assert.equal(GameDemoHeroTraining.upgrade(bean, 'normal', 10), 3)
        assert.deepEqual(GameDemoHeroTraining.view(bean), { level: 2, exp: 10, attack: 15 })
        assert.equal(bean.pill, 0)
        assert.throws(() => GameDemoHeroTraining.upgrade(bean, 'normal', 1), code('GAME_DEMO_INSUFFICIENT_ITEMS'))

        const near = player({ finePill: 10, heroLevel: GAME_DEMO_CONFIG.heroMaxLevel - 1 })
        assert.equal(GameDemoHeroTraining.upgrade(near, 'fine', 10), 1)
        assert.equal(near.finePill, 9)
        assert.deepEqual(GameDemoHeroTraining.view(near), {
            level: GAME_DEMO_CONFIG.heroMaxLevel,
            exp: 0,
            attack: 505,
        })
        assert.throws(() => GameDemoHeroTraining.upgrade(near, 'fine', 1), code('GAME_DEMO_HERO_MAX'))
    })

    it('settles alchemy immediately and records the batch score', () => {
        const bean = player({ herb: 20, dew: 10 })
        const rolls = [0, 50, 24, 99, 25]
        const batch = GameDemoAlchemy.start(bean, 5, 1234, () => rolls.shift()!)
        assert.deepEqual(batch, { id: 1, count: 5, startedAt: 1234, pill: 3, finePill: 2, score: 9 })
        assert.deepEqual([bean.herb, bean.dew, bean.pill, bean.finePill], [10, 5, 3, 2])
        assert.throws(() => GameDemoAlchemy.start(bean, 6, 1, () => 0), code('GAME_DEMO_INSUFFICIENT_ITEMS'))
        assert.deepEqual([bean.herb, bean.dew], [10, 5])
    })

    it('delivers each reward source once and claims gold into User copper once', () => {
        const user = { copper: 0 }
        const bean = player()
        const id = GameDemoMailbox.deliver(bean, 'season:1:rank:1', '奖励', 1000, 1)
        assert.equal(GameDemoMailbox.deliver(bean, 'season:1:rank:1', '奖励', 1000, 2), id)
        assert.equal(GameDemoMailbox.view(bean).mails.length, 1)
        GameDemoMailbox.claim(user, bean, id)
        GameDemoMailbox.claim(user, bean, id)
        assert.equal(user.copper, 1000)
        assert.deepEqual(GameDemoMailbox.view(bean).mails[0], {
            id,
            title: '奖励',
            gold: 1000,
            createdAt: 1,
            read: true,
            claimed: true,
        })
        assert.throws(() => GameDemoMailbox.claim(user, bean, 999), code('GAME_DEMO_MAIL_NOT_FOUND'))
    })

    it('archives claimed mail when full and refuses to drop unclaimed rewards', () => {
        const bean = player()
        for (let index = 0; index < GAME_DEMO_CONFIG.mailboxCapacity; index++)
            GameDemoMailbox.deliver(bean, `fill:${index}`, '填充', 1, index)
        assert.throws(() => GameDemoMailbox.deliver(bean, 'overflow', '溢出', 1, 0), code('GAME_DEMO_MAILBOX_FULL'))
        GameDemoMailbox.claim({ copper: 0 }, bean, 1)
        GameDemoMailbox.deliver(bean, 'overflow', '溢出', 1, 0)
        const mails = GameDemoMailbox.view(bean).mails
        assert.equal(mails.length, GAME_DEMO_CONFIG.mailboxCapacity)
        assert.equal(mails[0].id, 2)
        assert.equal(GameDemoMailbox.deliver(bean, 'fill:0', '填充', 1, 0), 1, '已归档来源仍在去重窗口内')
    })
})
