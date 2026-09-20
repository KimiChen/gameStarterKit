export interface RedDotBean {
    /**
     * 红点类型
     */
    type: string
    /**
     * 红点数量
     */
    state: int
    /**
     * 红点额外信息，这里用来标记红点位置
     */
    extraIds?: int[]
}
