import { TitleItem } from '../title/TitleItem'

export interface TitleBean {
    /**
     * 称号ID
     */
    titleId: int
    /**
     * 称号过期时间
     */
    titleExpire: int
    /**
     * 称号信息
     */
    titles?: Map<int, TitleItem>
}
