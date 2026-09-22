import type {
    IHeroRecruitGetCatalogReq,
    IHeroRecruitGetCatalogRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/heroRecruit'
import { GameAction } from '../../../runtime/action/GameAction'
import { HeroRecruitment } from '../rules/HeroRecruitment'

export class ActionHeroRecruitGetCatalog extends GameAction {
    async doAction(_req: IHeroRecruitGetCatalogReq, res: IHeroRecruitGetCatalogRes): Promise<void> {
        if (!this.user) throw { code: 'HERO_RECRUIT_USER_UNAVAILABLE', msg: '玩家档案未就绪' }
        res.snapshot = HeroRecruitment.snapshot(this.user)
    }
}
