import assert from 'node:assert/strict'
import {
    PUBLIC_SNAKE_SKIN_CATALOG,
    DEFAULT_SNAKE_SKIN,
} from '../../../generated/lobby-contract/gameplays/snake/cosmetics'
import {
    SNAKE_COSMETIC_WIRE_CATALOG,
    SNAKE_FRAGMENT_SKIN_IDS,
    SNAKE_FRAGMENT_SKIN_THRESHOLDS,
    __setSnakeCosmeticWritesEnabledForTest,
    canWriteSnakeSkinCosmetics,
} from '../../../src/modules/snakeCosmetic/lobby/SnakeSkinBusinessCatalog'
import { SnakeCosmeticNativeLobbyStore } from '../../../src/modules/snakeCosmetic/lobby/SnakeCosmeticNativeLobbyStore'
import { FakeCenterRedis, installFakeCenterRedis } from '../../support/FakeCenterRedis'

const profileKey = 'nativeLobby:snakeCosmetic:profiles:v1'
const craftableSkinId = [...SNAKE_FRAGMENT_SKIN_THRESHOLDS.keys()][0]!
const craftableThreshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(craftableSkinId)!

async function seed(redis: FakeCenterRedis, uid: string, sId: number, value: unknown): Promise<void> {
    await redis.hSet(profileKey, `${sId}:${uid}`, typeof value === 'string' ? value : JSON.stringify(value))
}

describe('snakeCosmetic native Lobby store', () => {
    it('aligns the server business catalog with the shared public skin catalog', () => {
        assert.equal(SNAKE_COSMETIC_WIRE_CATALOG.length, PUBLIC_SNAKE_SKIN_CATALOG.length)
        assert.deepEqual(
            SNAKE_COSMETIC_WIRE_CATALOG.map((entry) => entry.skinId),
            PUBLIC_SNAKE_SKIN_CATALOG.map((entry) => entry.skinId),
        )
        for (const entry of SNAKE_COSMETIC_WIRE_CATALOG) {
            assert.ok(entry.displayName.length > 0)
            assert.ok(entry.rarity >= 0 && entry.rarity <= 5)
            assert.equal(entry.fragmentThreshold === null, entry.acquisition !== 'fragmentCraft')
        }
        assert.ok(SNAKE_FRAGMENT_SKIN_IDS.length > 0)
    })

    it('returns the default wardrobe snapshot for a uid that never wrote one', async () => {
        installFakeCenterRedis()
        const store = new SnakeCosmeticNativeLobbyStore()
        const snapshot = await store.snapshot('external-1', 7)
        assert.equal(snapshot.profile.equippedSkinId, DEFAULT_SNAKE_SKIN.skinId)
        assert.deepEqual(snapshot.profile.ownedSkinIds, [DEFAULT_SNAKE_SKIN.skinId])
        assert.deepEqual(
            snapshot.profile.fragmentBalances,
            Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((id) => [String(id), 0])),
        )
        assert.equal(snapshot.catalog.length, SNAKE_COSMETIC_WIRE_CATALOG.length)
    })

    it('keeps equip idempotent: a repeat is a no-op and never bumps the version', async () => {
        const redis = installFakeCenterRedis()
        const store = new SnakeCosmeticNativeLobbyStore()
        await seed(redis, 'external-2', 7, {
            equippedSkinId: DEFAULT_SNAKE_SKIN.skinId,
            ownedSkinIds: [DEFAULT_SNAKE_SKIN.skinId, 2],
            fragmentBalances: Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((id) => [String(id), 0])),
        })
        const first = await store.equip('external-2', 7, 2)
        assert.equal(first.profile.equippedSkinId, 2)
        assert.equal(first.profile.version, 1)
        const repeat = await store.equip('external-2', 7, 2)
        assert.equal(repeat.profile.version, 1)
        assert.equal(repeat.profile.equippedSkinId, 2)
    })

    it('rejects equipping a skin the player does not own and an unknown skin', async () => {
        installFakeCenterRedis()
        const store = new SnakeCosmeticNativeLobbyStore()
        await assert.rejects(
            () => store.equip('external-3', 7, 2),
            (error: { code: string }) => error.code === 'SNAKE_SKIN_NOT_OWNED',
        )
        await assert.rejects(
            () => store.equip('external-3', 7, 999_999),
            (error: { code: string }) => error.code === 'SNAKE_SKIN_UNKNOWN',
        )
    })

    it('deducts the exact threshold once and never charges again for an owned skin', async () => {
        const redis = installFakeCenterRedis()
        const store = new SnakeCosmeticNativeLobbyStore()
        await seed(redis, 'external-4', 7, {
            equippedSkinId: DEFAULT_SNAKE_SKIN.skinId,
            ownedSkinIds: [DEFAULT_SNAKE_SKIN.skinId],
            fragmentBalances: {
                ...Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((id) => [String(id), 0])),
                [craftableSkinId]: craftableThreshold + 3,
            },
        })
        const unlocked = await store.unlock('external-4', 7, craftableSkinId)
        assert.ok(unlocked.profile.ownedSkinIds.includes(craftableSkinId))
        assert.equal(unlocked.profile.fragmentBalances[String(craftableSkinId)], 3)
        assert.equal(unlocked.profile.version, 1)

        const repeat = await store.unlock('external-4', 7, craftableSkinId)
        assert.equal(repeat.profile.fragmentBalances[String(craftableSkinId)], 3)
        assert.equal(repeat.profile.version, 1)
    })

    it('rejects non-craftable and under-funded unlocks with the declared domain codes', async () => {
        const redis = installFakeCenterRedis()
        const store = new SnakeCosmeticNativeLobbyStore()
        const nonCraftable = SNAKE_COSMETIC_WIRE_CATALOG.find((entry) => entry.acquisition !== 'fragmentCraft')!.skinId
        await assert.rejects(
            () => store.unlock('external-5', 7, nonCraftable),
            (error: { code: string }) => error.code === 'SNAKE_SKIN_NOT_CRAFTABLE',
        )
        await seed(redis, 'external-5', 7, {
            equippedSkinId: DEFAULT_SNAKE_SKIN.skinId,
            ownedSkinIds: [DEFAULT_SNAKE_SKIN.skinId],
            fragmentBalances: Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((id) => [String(id), 0])),
        })
        await assert.rejects(
            () => store.unlock('external-5', 7, craftableSkinId),
            (error: { code: string }) => error.code === 'SNAKE_SKIN_FRAGMENTS_INSUFFICIENT',
        )
    })

    it('fails closed on the write gate and on a corrupt stored profile', async () => {
        const redis = installFakeCenterRedis()
        const store = new SnakeCosmeticNativeLobbyStore()
        __setSnakeCosmeticWritesEnabledForTest(false)
        try {
            assert.equal(canWriteSnakeSkinCosmetics(), false)
            await assert.rejects(
                () => store.equip('external-6', 7, DEFAULT_SNAKE_SKIN.skinId),
                (error: { code: string }) => error.code === 'SNAKE_COSMETIC_WRITES_DISABLED',
            )
            await assert.rejects(
                () => store.unlock('external-6', 7, craftableSkinId),
                (error: { code: string }) => error.code === 'SNAKE_COSMETIC_WRITES_DISABLED',
            )
        } finally {
            __setSnakeCosmeticWritesEnabledForTest(true)
        }
        await seed(redis, 'external-6', 7, '{not json')
        await assert.rejects(
            () => store.snapshot('external-6', 7),
            (error: { code: string }) => error.code === 'USER_DATA_LOST',
        )
        await seed(redis, 'external-7', 7, {
            equippedSkinId: 2,
            ownedSkinIds: [DEFAULT_SNAKE_SKIN.skinId],
            fragmentBalances: Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((id) => [String(id), 0])),
        })
        await assert.rejects(
            () => store.snapshot('external-7', 7),
            (error: { code: string }) => error.code === 'USER_DATA_LOST',
        )
    })
})
