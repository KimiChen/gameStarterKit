export interface EmployeeItem {
    /**
     * 配置id
     */
    id: int
    /**
     * 等级
     */
    lv: int
    /**
     * 是否在摸鱼
     */
    isRelax: boolean
    /**
     * 是否准备开摸（是否已经加入定时器）
     */
    isReady: boolean
}
