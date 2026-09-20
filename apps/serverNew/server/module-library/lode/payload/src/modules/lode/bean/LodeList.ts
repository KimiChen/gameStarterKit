import { ClassNetMap, ServerHashJson } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

/**
 * 灵脉匹配列表
 */
@ClassNetMap
export class LodeList extends ServerHashJson {
    /**
     * 灵脉id
     */
    id: int = 0

    /**
     * 位置
     */
    pos: int = 0

    /**
     * 当前战斗状态：0空闲 >0战斗中
     */
    status: int = -1

    /**
     * 占领者
     */
    owner?: UserInfoOnlyNetBean

    /**
     * 占领时间
     */
    occupyTime: int = -1

    /**
     * 保护结束时间
     */
    protectEndTime: int = -1

    /**
     * 自动离开时间
     */
    autoLeaveTime: int = -1
}
