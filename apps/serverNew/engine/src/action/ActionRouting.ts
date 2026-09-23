/** 入口解析一次的调度结果；跨进程透传，目标进程不得重算。 */
export interface ActionRouting {
    /** 空值表示普通 Worker；非负整数按取余定位 Task Worker。入口将 -1 归一为空。 */
    readonly taskGroupId?: number
    /** 进程内串行键；未声明时入口使用有效 uid，无 uid 则不分组。 */
    readonly bindId?: number
}
