import { Bean } from '@arthropoda/game-engine'

/**
 * 场景角色信息
 */
export class SceneActorItem extends Bean {
    /**
     * id
     */
    id: int = 0

    /**
     * 配置Id
     */
    cId: int = 0

    /**
     * 配置组Id
     */
    cGroupId: int = 0

    /**
     * 剩余血量
     */
    leftHp: int = 0

    /**
     * 是否死亡
     */
    isDead: boolean = false

    /**
     * 复活时间
     */
    rebornTime: int = 0

    /**
     * 死亡时间
     */
    deadTime: int = 0

    /**
     * 大招释放次数
     */
    skillTimes: int = 0

    /**
     * 累计恢复多少怒气
     */
    skillRecoveryNum: int = 0

    /**
     * 恢复生命时间
     */
    reLifeTime: int = 0
}
