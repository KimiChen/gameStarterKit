import { Bean, DiffMap } from '@arthropoda/game-engine'
import { WifePlotItem } from './WifePlotItem'
import { WifeFurnitureItem } from './WifeFurnitureItem'
import { WifeRelativeItem } from './WifeRelativeItem'

/**
 * 红颜
 */
export class WifeItem extends Bean {
    /**
     * 红颜id
     */
    id: int = 0

    /**
     * 亲密度
     */
    bosom: int = 0

    /**
     * 时装ID
     */
    skinId: int = 0

    /**
     * 领取奖励时间
     */
    awardTime: int = 0

    /**
     * 已触发的剧情ID
     */
    lookPlotIds?: DiffMap<int, WifePlotItem>

    /**
     * 亲戚信息
     */
    relatives?: DiffMap<int, WifeRelativeItem>

    /**
     * 家具信息
     */
    furnitures?: DiffMap<int, WifeFurnitureItem>

    /**
     * 出游相遇次数
     */
    travelNum: int = 0

    /**
     * 领奖剧情ID
     */
    plotIds?: DiffMap<int, WifePlotItem>

    /**
     * 首次生娃子嗣ID
     */
    firstChildId: int = 0
}
