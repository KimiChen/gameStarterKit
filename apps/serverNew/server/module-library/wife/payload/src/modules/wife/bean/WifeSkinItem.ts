import { Bean, DiffMap } from '@arthropoda/game-engine'
import { WifePlotItem } from './WifePlotItem'

export class WifeSkinItem extends Bean {
    /**
     * 时装ID
     */
    id: int = 0

    /**
     * 时装剩余数量
     */
    num: int = 0

    /**
     * 等级
     */
    lv: int = 0

    /**
     * 已完成的剧情ID
     */
    plotIds?: DiffMap<int, WifePlotItem>

    /**
     * 获得时间（过期后重新获得会更新获得时间）
     */
    time: int = 0
}
