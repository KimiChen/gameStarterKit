export interface SceneCdItem {
    /**
     * sysId_cId
     */
    key: string
    /**
     * 系统Id
     */
    sysId: int
    /**
     * 配置Id
     */
    cId: int
    /**
     * 下次可进场景时间
     */
    nextIntoTime: int
}
