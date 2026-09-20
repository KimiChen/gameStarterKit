import { Bean } from '@arthropoda/game-engine'

/**
 * 联盟列表信息
 */
export class GuildListItemBean extends Bean {
    /**
     * 联盟Id
     */
    id: int = 0

    /**
     * 联盟名称
     */
    name: string = ''

    /**
     * 联盟等级
     */
    lv: int = 0

    /**
     * 联盟内成员数量
     */
    num: int = 0

    /**
     * 旗帜
     */
    head: int = 0

    /**
     * 联盟势力
     */
    power: int = 0

    /**
     * 是否申请
     */
    isApply: int = -1

    /**
     * 联盟审核条件
     */
    open: int = 0
}
