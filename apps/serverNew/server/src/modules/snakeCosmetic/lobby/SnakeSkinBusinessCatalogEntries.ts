/**
 * snakeCosmetic 域的服务端专属业务目录数据（冻结表）。
 *
 * 双端公开身份目录（skinId / 可用性 / 默认皮肤）仍在 `apps/shared/src/gameplays/snake`，
 * 由 `generated/lobby-contract/gameplays/snake` 提供；本表只承载**服务端裁决**用的
 * displayName / rarity / acquisition / fragmentThreshold 等展示与门槛数据。
 *
 * 表内顺序必须与 shared 的公开目录逐项对齐，由 `SnakeSkinBusinessCatalog.ts` 的 fail-closed
 * validator 在模块加载期强制（长度、顺序、ID 集合、门槛与获取方式的一致性）。
 */
export const SNAKE_SKIN_BUSINESS_CATALOG_ENTRIES = [
    {
        skinId: 1,
        aiEligible: false,
        displayName: {
            state: 'approved',
            value: '小红',
        },
        rarity: {
            state: 'approved',
            value: 0,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'default',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 2,
        aiEligible: false,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 2',
        },
        rarity: {
            state: 'approved',
            value: 0,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'levelUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 3,
        aiEligible: false,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 3',
        },
        rarity: {
            state: 'approved',
            value: 0,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'levelUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 4,
        aiEligible: false,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 4',
        },
        rarity: {
            state: 'approved',
            value: 0,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'levelUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 10,
        aiEligible: false,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 10',
        },
        rarity: {
            state: 'approved',
            value: 1,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'locked',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 11,
        aiEligible: false,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 11',
        },
        rarity: {
            state: 'approved',
            value: 1,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'locked',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 101,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 101',
        },
        rarity: {
            state: 'approved',
            value: 2,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'achievementUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 111,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 111',
        },
        rarity: {
            state: 'approved',
            value: 1,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'locked',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 112,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 112',
        },
        rarity: {
            state: 'approved',
            value: 1,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'locked',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 132,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 132',
        },
        rarity: {
            state: 'approved',
            value: 1,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'achievementUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 133,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 133',
        },
        rarity: {
            state: 'approved',
            value: 2,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'fragmentCraft',
        },
        fragmentThreshold: {
            state: 'approved',
            value: 300,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 139,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 139',
        },
        rarity: {
            state: 'approved',
            value: 2,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'achievementUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 401,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 401',
        },
        rarity: {
            state: 'approved',
            value: 2,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'fragmentCraft',
        },
        fragmentThreshold: {
            state: 'approved',
            value: 10,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 403,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 403',
        },
        rarity: {
            state: 'approved',
            value: 2,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'fragmentCraft',
        },
        fragmentThreshold: {
            state: 'approved',
            value: 120,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 411,
        aiEligible: true,
        displayName: {
            state: 'technical-draft',
            value: '皮肤 411',
        },
        rarity: {
            state: 'approved',
            value: 3,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'fragmentCraft',
        },
        fragmentThreshold: {
            state: 'approved',
            value: 300,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
    {
        skinId: 701,
        aiEligible: true,
        displayName: {
            state: 'approved',
            value: '招财喵',
        },
        rarity: {
            state: 'approved',
            value: 3,
        },
        ownershipItemId: {
            state: 'unavailable',
            value: null,
        },
        fragmentItemId: {
            state: 'unavailable',
            value: null,
        },
        acquisition: {
            state: 'approved',
            value: 'achievementUnlock',
        },
        fragmentThreshold: {
            state: 'unavailable',
            value: null,
        },
        saleState: {
            state: 'approved',
            value: 'off-sale',
        },
        price: {
            state: 'unavailable',
            value: null,
        },
    },
] as const

export const EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH =
    'a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075'

export const SERVER_SNAKE_SKIN_BUSINESS_HASH = 'b851e3453a39071a01771d0e8e5127343a95cba5fbe502cea9885f372f2d9d2c'
