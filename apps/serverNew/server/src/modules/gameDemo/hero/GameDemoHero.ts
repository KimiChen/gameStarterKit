import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { AtomicHashTransaction, atomicJsonCodec } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG, gameDemoAttack } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import {
    validateGameDemoHero,
    validateGameDemoUpgradeRes,
    type IGameDemoHeroUpgradeReq,
    type IGameDemoHeroRes,
    type IGameDemoUpgradeRes,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoHero'
import type { GameDemoHero as HeroView } from '../../../../generated/lobby-contract/kits/gameDemo/api/growth'
import { NativeLobbyAssets } from '../../../runtime/lobby/NativeLobbyAssets'
import { GameDemoAccount } from '../growth/GameDemoAccount'

const heroCodec = atomicJsonCodec<HeroView>((value): value is HeroView => {
    try {
        validateGameDemoHero(value)
        return true
    } catch {
        return false
    }
})
export class GameDemoHero {
    private readonly heroes = new AtomicHash('kt:gameDemo:heroes:v1', heroCodec)
    private readonly operations = new AtomicOperation(
        'kt:gameDemo:hero-operations:v1',
        (value): value is IGameDemoUpgradeRes => {
            try {
                validateGameDemoUpgradeRes(value)
                return true
            } catch {
                return false
            }
        },
    )

    async snapshot(tx: AtomicHashTransaction, uid: string, sId: number): Promise<HeroView> {
        const hero = await tx.get(this.heroes, NativeLobbyAssets.owner(uid, sId))
        return hero ? validateGameDemoHero(hero) : { level: 1, exp: 0, attack: gameDemoAttack(1), revision: 0 }
    }

    async read(uid: string, sId: number): Promise<IGameDemoHeroRes> {
        return AtomicHashTransaction.run(async (tx) => ({
            assets: await new GameDemoAccount().snapshot(tx, uid, sId),
            hero: await this.snapshot(tx, uid, sId),
        }))
    }

    async upgrade(uid: string, sId: number, request: IGameDemoHeroUpgradeReq): Promise<IGameDemoUpgradeRes> {
        if ((request.pill !== 'normal' && request.pill !== 'fine') || (request.count !== 1 && request.count !== 10))
            throw { code: 'INVALID_PAYLOAD', msg: '培养参数无效' }
        const result = await this.operations.run(
            JSON.stringify([sId, uid, request.clientReqId]),
            JSON.stringify([request.pill, request.count]),
            async (tx) => {
                const account = new GameDemoAccount()
                const assets = await account.snapshot(tx, uid, sId)
                if (!assets.initialized) throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先初始化玩法账号' }
                const hero = await this.snapshot(tx, uid, sId)
                if (hero.level === GAME_DEMO_CONFIG.heroMaxLevel)
                    throw { code: 'GAME_DEMO_HERO_MAX', msg: '英雄已满级' }
                const available = request.pill === 'normal' ? assets.items.pill : assets.items.finePill
                if (!available) throw { code: 'INSUFFICIENT_BALANCE', msg: '经验丹不足' }
                let consumed = 0
                while (consumed < Math.min(request.count, available) && hero.level < GAME_DEMO_CONFIG.heroMaxLevel) {
                    consumed++
                    hero.exp += GAME_DEMO_CONFIG.pillExp[request.pill]
                    while (hero.exp >= GAME_DEMO_CONFIG.heroExpPerLevel && hero.level < GAME_DEMO_CONFIG.heroMaxLevel) {
                        hero.exp -= GAME_DEMO_CONFIG.heroExpPerLevel
                        hero.level++
                    }
                }
                if (hero.level === GAME_DEMO_CONFIG.heroMaxLevel) hero.exp = 0
                hero.attack = gameDemoAttack(hero.level)
                hero.revision++
                const itemId =
                    request.pill === 'normal' ? GAME_DEMO_CONFIG.itemIds.pill : GAME_DEMO_CONFIG.itemIds.finePill
                await NativeLobbyAssets.changeItem(tx, uid, sId, itemId, -consumed)
                await tx.set(this.heroes, NativeLobbyAssets.owner(uid, sId), hero)
                return { assets: await account.snapshot(tx, uid, sId), hero, consumed }
            },
        )
        return validateGameDemoUpgradeRes(result)
    }
}
