import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

export class LodeBattleRecordItem {
    /**
     * 战报Id
     */
    public reportId: int = 0

    /**
     * 目标id
     */
    public targetId: int = 0

    /**
     * 对手类型
     */
    public targetType: int = 0

    /**
     * 玩家信息
     */
    public target?: UserInfoOnlyNetBean

    /**
     * 记录类型（1.进攻,2.防御）
     */
    public type: int = 0

    /**
     * 战斗结果
     */
    public result: int = 0

    /**
     * 战斗时间
     */
    public fightTime: int = 0

    /**
     * 抢夺灵脉id
     */
    public targetLodeId: int = 0

    /**
     * 当前所处境界
     */
    public realm: int = 0

    /**
     * 文本
     */
    public data: string = ''

    /**
     * 文本Id
     */
    public dataId: int = 0
}
