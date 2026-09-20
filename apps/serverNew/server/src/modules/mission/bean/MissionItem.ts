import { Bean, DiffArray, DiffMap, OnlyRedis } from '@arthropoda/game-engine'

export class MissionItem extends Bean {
    /**
     * 历练场景类型
     */
    type: int = 0

    /**
     * 剩余已购买的可挑战数量
     */
    buyNum: int = 0

    /**
     * 已挑战次数
     */
    challenge: int = 0

    /**
     * 设置boss复活不提醒
     */
    subscribes?: DiffMap<int, int>

    /**
     * 设置boss复活不提醒历史
     */
    subscribesHis?: DiffMap<int, int>

    /**
     * 结算剩余的可挑战次数
     */
    settleNum: int = 0

    /**
     * 累计挑战次数
     */
    @OnlyRedis
    totalTimes: int = 0
}
