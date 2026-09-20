import { ServerHashJson } from '@arthropoda/game-engine'

/**
 * 灵脉信息
 */
export class Lodes extends ServerHashJson {
    /**
     * 灵脉id
     */
    id: int = 0

    /**
     * 当前状态：0未占领 非0战斗中
     */
    status: int = 0

    /**
     * 占领者（0为npc 非0为玩家）
     */
    owner: int = 0

    /**
     * 占领时间
     */
    occupyTime: int = 0

    /**
     * 保护结束时间
     */
    protectEndTime: int = 0

    /**
     * 自动离开时间
     */
    autoLeaveTime: int = 0
}
