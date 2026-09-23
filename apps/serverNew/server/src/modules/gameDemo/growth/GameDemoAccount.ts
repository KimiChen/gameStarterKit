import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { AtomicHashTransaction, atomicJsonCodec } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import {
    validateGameDemoAssetsRes,
    type IGameDemoAssetsRes,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemo'
import { NativeLobbyAssets } from '../../../runtime/lobby/NativeLobbyAssets'
import { GameDemoMailbox } from '../rewards/GameDemoMailbox'

interface AccountRevision {
    schemaVersion: 1
    revision: number
    starterPillsGranted?: boolean
}
const accountCodec = atomicJsonCodec<AccountRevision>((value): value is AccountRevision => {
    const account = value as AccountRevision | null
    return !!account && account.schemaVersion === 1 && Number.isSafeInteger(account.revision) && account.revision >= 1
        && (account.starterPillsGranted === undefined || typeof account.starterPillsGranted === 'boolean')
})

export class GameDemoAccount {
    private readonly accounts = new AtomicHash('kt:gameDemo:accounts:v1', accountCodec)
    private readonly operations = new AtomicOperation(
        'kt:gameDemo:asset-operations:v1',
        (value): value is IGameDemoAssetsRes => {
            try {
                validateGameDemoAssetsRes(value)
                return true
            } catch {
                return false
            }
        },
    )

    async read(uid: string, sId: number): Promise<IGameDemoAssetsRes> {
        return AtomicHashTransaction.run((tx) => this.snapshot(tx, uid, sId))
    }

    async initialize(uid: string, sId: number, clientReqId: string, devEnabled: boolean): Promise<IGameDemoAssetsRes> {
        if (!devEnabled) throw { code: 'GAME_DEMO_DEV_DISABLED', msg: '测试资源入口未开放' }
        const owner = NativeLobbyAssets.owner(uid, sId)
        const now = Date.now()
        const result = await this.operations.run(
            JSON.stringify([sId, uid, 'initialize', clientReqId]),
            'initialize:v1',
            async (tx) => {
                const existing = await tx.get(this.accounts, owner)
                if (!existing) await NativeLobbyAssets.changeGold(tx, uid, sId, GAME_DEMO_CONFIG.initialGold)
                // A persisted grant marker, not the current balance: spending must never refill the gift.
                // Legacy accounts omit this optional field and receive the pills once without more gold.
                if (!existing?.starterPillsGranted) {
                    for (const kind of ['pill', 'finePill'] as const)
                        await NativeLobbyAssets.changeItem(tx, uid, sId,
                            GAME_DEMO_CONFIG.itemIds[kind], GAME_DEMO_CONFIG.initialPills[kind])
                    await tx.set(this.accounts, owner, {
                        schemaVersion: 1, revision: (existing?.revision ?? 0) + 1, starterPillsGranted: true,
                    })
                }
                await new GameDemoMailbox().deliver(
                    tx,
                    uid,
                    sId,
                    'welcome:v1',
                    '玩法验证奖励',
                    GAME_DEMO_CONFIG.welcomeMailGold,
                    now,
                )
                return this.snapshot(tx, uid, sId)
            },
        )
        return validateGameDemoAssetsRes(result)
    }

    async snapshot(tx: AtomicHashTransaction, uid: string, sId: number): Promise<IGameDemoAssetsRes> {
        const owner = NativeLobbyAssets.owner(uid, sId)
        const account = await tx.get(this.accounts, owner)
        const item = async (id: number) =>
            (await tx.get(NativeLobbyAssets.items(), NativeLobbyAssets.itemOwner(uid, sId, id))) ?? 0
        const ids = GAME_DEMO_CONFIG.itemIds
        return {
            initialized: account !== undefined,
            revision: (await tx.get(NativeLobbyAssets.versions(), owner)) ?? 0,
            gold: (await tx.get(NativeLobbyAssets.gold(), owner)) ?? 0,
            items: {
                herb: await item(ids.herb),
                dew: await item(ids.dew),
                pill: await item(ids.pill),
                finePill: await item(ids.finePill),
            },
        }
    }
}
