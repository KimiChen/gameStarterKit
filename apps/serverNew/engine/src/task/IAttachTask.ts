export interface IEngineAttachTask {
    /** 业务开始时调用 */
    onStart(): Promise<void>
    /**
     * 提交前调用：此时 Bean 的字段级 diff 仍然完整。
     *
     * 需要在「落盘」之前读取变更的任务（如同步回执）必须挂在这里：持久化会清空 diff，
     * 之后再读只能拿到空载荷。只读内存状态，⛔ 不要在这里做持久化。
     */
    onBeforeCommit?(): Promise<void>
    /** 业务成功后调用 */
    onActionSuccess(res: any): Promise<void>
    /** 业务失败后调用 */
    onActionError(e: Error): Promise<void>
    /** 用于清理 */
    onClear(): Promise<void>
}

export interface IActionAttachTask {
    /** 业务开始时调用 */
    onStart(): Promise<void>
    /** IActionLogic调用结束, 框架redis net等任务之前 */
    onDoAction(res: any): Promise<void>
    /** redis已经入库, change已经发送后的收尾事件 */
    onEngineEnd(): Promise<void>

}

