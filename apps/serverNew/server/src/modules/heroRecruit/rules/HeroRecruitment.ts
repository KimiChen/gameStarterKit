import type { IHeroRecruitSnapshot } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/heroRecruit'
import { HERO_RECRUIT_CATALOG } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/heroRecruit'
import type { User } from '../../user/bean/User'

/**
 * 英雄招募响应共用的只读快照组装。
 */
export class HeroRecruitment {
    static snapshot(user: User): IHeroRecruitSnapshot {
        return {
            copper: user.copper,
            ownedHeroIds: this.ownedHeroIds(user),
            catalog: HERO_RECRUIT_CATALOG.map((entry) => ({ ...entry })),
        }
    }

    private static ownedHeroIds(user: User): number[] {
        return user.recruitedHeroIds ? [...user.recruitedHeroIds].sort((left, right) => left - right) : []
    }
}
