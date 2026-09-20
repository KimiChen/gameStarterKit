import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

export class ArenaBattleRecordItem {
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
     * 得到的天梯分
     */
    public tierScore: int = 0

    /**
     * 得到的声望
     */
    public prestige: int = 0

    /**
     * 记录归属玩家信息
     */
    public userInfo?: UserInfoOnlyNetBean
}
