import { DiffMap } from '@arthropoda/game-engine'
import { AttrTypeBean } from './AttrTypeBean'
import { Bean } from '@arthropoda/game-engine'

/**
 * 玩家各个系统属性数值
 */
export class AttrModBean extends Bean {
    id = 0

    attrs?: DiffMap<int, AttrTypeBean>
}
