import { ForgeBean } from '../equip/ForgeBean'

export interface ForgePoolBean {
    /**
     * 装备池id
     */
    id: int
    /**
     * 已免费打造次数-单抽
     */
    freeTimes: int
    /**
     * 下次可免费打造时间-单抽
     */
    nextCanFreeTime: int
    /**
     * 打造次数
     */
    times: int
    /**
     * 品质保底信息
     */
    qualityBaseInfo?: Map<int, ForgeBean>
    /**
     * 十连触发标记
     */
    tenTag: int
    /**
     * 已仙玉打造次数-单抽
     */
    gcTimes: int
}
