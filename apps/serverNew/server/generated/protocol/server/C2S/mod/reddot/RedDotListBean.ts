import { RedDotBean } from '../reddot/RedDotBean'

export interface RedDotListBean {
    /**
     * 红点类型
     */
    type: string
    /**
     * 红点信息
     */
    redDot?: Map<string, RedDotBean>
}
