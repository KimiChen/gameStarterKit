export interface SceneActorItem {
    /**
     * id
     */
    id: int
    /**
     * 配置Id
     */
    cId: int
    /**
     * 配置组Id
     */
    cGroupId: int
    /**
     * 剩余血量
     */
    leftHp: int
    /**
     * 是否死亡
     */
    isDead: boolean
    /**
     * 复活时间
     */
    rebornTime: int
    /**
     * 死亡时间
     */
    deadTime: int
    /**
     * 大招释放次数
     */
    skillTimes: int
    /**
     * 累计恢复多少怒气
     */
    skillRecoveryNum: int
    /**
     * 恢复生命时间
     */
    reLifeTime: int
}
