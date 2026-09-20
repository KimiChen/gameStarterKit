/**
 * 炼器接口
 */
export interface EquipForgeProcess {
    /**
     * 前置检查
     */
    check(): void

    /**
     * 计算消耗
     */
    cost(): void

    /**
     * 重组卡池
     */
    rebuildPool(): void

    /**
     *  开始抽取
     */
    draw(): Promise<void>

    /**
     * 抽后事件
     */
    afterEvent(): void
}
