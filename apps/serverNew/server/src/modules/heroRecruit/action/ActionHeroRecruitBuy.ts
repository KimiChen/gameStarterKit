import type {
    IHeroRecruitBuyReq,
    IHeroRecruitBuyRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/heroRecruit'
import { getHeroRecruitCatalogEntry } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/heroRecruit'
import { GameAction } from '../../../runtime/action/GameAction'
import { HeroRecruitment } from '../rules/HeroRecruitment'

export class ActionHeroRecruitBuy extends GameAction {
    async doAction(req: IHeroRecruitBuyReq, res: IHeroRecruitBuyRes): Promise<void> {
        if (!this.user) throw { code: 'HERO_RECRUIT_USER_UNAVAILABLE', msg: '玩家档案未就绪' }

        const hero = getHeroRecruitCatalogEntry(req.heroId)
        if (!hero) throw { code: 'HERO_RECRUIT_UNKNOWN', msg: '英雄不存在' }

        const owned = this.user.recruitedHeroIds
        if (!owned) throw { code: 'HERO_RECRUIT_USER_UNAVAILABLE', msg: '英雄档案未就绪' }
        if (owned.includes(req.heroId)) throw { code: 'HERO_RECRUIT_ALREADY_OWNED', msg: '该英雄已拥有' }
        if (this.user.copper < hero.copperPrice) {
            throw { code: 'HERO_RECRUIT_INSUFFICIENT_COPPER', msg: '铜币不足' }
        }

        this.user.copper -= hero.copperPrice
        owned.add(req.heroId)
        res.purchasedHeroId = req.heroId
        res.snapshot = HeroRecruitment.snapshot(this.user)
    }
}
