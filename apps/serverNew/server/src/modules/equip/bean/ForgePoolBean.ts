import { DiffMap } from '@arthropoda/game-engine'
import { ForgeBean } from './ForgeBean'
import { Bean } from '@arthropoda/game-engine'

/**
 * 装备池
 */
export class ForgePoolBean extends Bean {
    /**
     * 装备池id
     */
    id: int = 0

    /**
     * 已免费打造次数-单抽
     */
    freeTimes: int = 0

    /**
     * 下次可免费打造时间-单抽
     */
    nextCanFreeTime: int = 0

    /**
     * 打造次数
     */
    times: int = 0

    /**
     * 品质保底信息
     */
    qualityBaseInfo?: DiffMap<int, ForgeBean>

    /**
     * 十连触发标记
     */
    tenTag: int = 0

    /**
     * 已仙玉打造次数-单抽
     */
    gcTimes: int = 0
}
