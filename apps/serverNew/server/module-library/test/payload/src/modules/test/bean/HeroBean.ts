import { Bean, DiffArray, DiffMap, OnlyNet } from '@arthropoda/game-engine'
import { SkillBean } from './SkillBean'

export class HeroBean extends Bean {
    hId = 0

    @OnlyNet
    lv = 0

    skill?: SkillBean

    array?: DiffArray<int>

    maps?: DiffMap<int, SkillBean>
}
