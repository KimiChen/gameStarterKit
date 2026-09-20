import { Bean, DiffMap } from '@arthropoda/game-engine'
import { ArenaUserStatItem } from './ArenaUserStatItem'

export class ArenaUserItem extends Bean {
    /**
     * 历史最高天梯分
     */
    maxTierScore: int = 0

    /**
     * 防守/进攻胜率统计
     */
    stat?: DiffMap<int, ArenaUserStatItem>
}
