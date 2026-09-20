export interface IEngineAttachTask {
    /** 业务开始时调用 */
    onStart(): Promise<void>
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

