export interface HServer {
    /**
     * 区服Id
     */
    id: int
    /**
     * 当前活动历练boss等级 kui_cow_open 配置表id
     */
    kuiCowOpenId: int
    /**
     * 已经刷出来的活动历练boss等级 kui_cow 表id
     */
    currKuiCowLv: int
}
