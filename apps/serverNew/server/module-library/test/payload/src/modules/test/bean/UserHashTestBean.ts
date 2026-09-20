import { UserHash } from '@arthropoda/game-engine'
import { Mod, OnlyNet, OnlyRedis } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { HeroBean } from './HeroBean'
import { TestBean1 } from './TestBean1'

// @Mod
export class UserHashTestBean extends UserHash {
    id: int = 0

    hero?: HeroBean

    gc = 0.0

    @OnlyRedis
    deviceId: string = ''

    @OnlyNet
    testBean1?: TestBean1

    @OnlyNet
    testPower: int = 19

    attrs?: DiffMap<int, AttrTypeBean>
}
