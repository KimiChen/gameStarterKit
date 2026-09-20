/** FieldStatus Bean 属性变更状态 */
export enum FieldStatus {
    /** 不可用状态 */
    Invalid = -1,
    /** 已初始化 未变更状态 */
    None = 0,
    /** 属性对象的子属性变更触发的属性变更 */
    ChildUpdate = 1,
    /** 属性对象覆盖变更 */
    Update = 2,
    /** 属性对象新建对象（只有 Map Data 的 k-v 才会用到） */
    New = 3,
    /** 属性对象删除 */
    Delete = 4,
}

/** BeanStatus Bean 对象变更状态 */
export enum BeanStatus {
    /** 不可用状态 */
    Invalid = -1,
    /** 已初始化 未变更状态 */
    None = 0,
    /** 属性变更触发的 对象属性变更 */
    FieldUpdate = 1,
    /** 对象新建 */
    New = 2,
    /** 对象删除 */
    Delete = 3,
    /** BeanMap 自动初始化的对象才会标记为这个状态 */
    AutoInit = 4,
    /** 特殊的 Hash 类型 Bean（例如 HashJson，HashFlat） 删除整个集合所有对象，不会出现在普通映射对象中 */
    HashCollectionDelAll = 5,
}

/**
 * 计算 fieldStatus 状态变化
 * 变更之前的status -> 触发的变更status -> 最终的结果status
 * ========================================================================================
 * FieldStatusNew -> FieldStatusNew -> FieldStatusNew
 * FieldStatusNew -> FieldStatusUpdate -> FieldStatusNew
 * FieldStatusNew -> FieldStatusFieldUpdate -> FieldStatusNew
 * FieldStatusNew -> FieldStatusDelete -> FieldStatusNone
 * ========================================================================================
 * FieldStatusUpdate -> FieldStatusNew -> FieldStatusUpdate
 * FieldStatusUpdate -> FieldStatusUpdate -> FieldStatusUpdate
 * FieldStatusUpdate -> FieldStatusFieldUpdate	 -> FieldStatusUpdate
 * FieldStatusUpdate -> FieldStatusDelete -> FieldStatusDelete
 * ========================================================================================
 * FieldStatusFieldUpdate -> FieldStatusNew -> FieldStatusUpdate
 * FieldStatusFieldUpdate -> FieldStatusUpdate -> FieldStatusUpdate
 * FieldStatusFieldUpdate -> FieldStatusFieldUpdate -> FieldStatusFieldUpdate
 * FieldStatusFieldUpdate -> FieldStatusDelete -> FieldStatusDelete
 * ========================================================================================
 * FieldStatusDelete -> FieldStatusNew -> FieldStatusUpdate
 * FieldStatusDelete -> FieldStatusUpdate -> FieldStatusUpdate
 * FieldStatusDelete -> FieldStatusFieldUpdate -> FieldStatusDelete
 * FieldStatusDelete -> FieldStatusDelete -> FieldStatusDelete
 * ========================================================================================
 */
export namespace FieldStatus {
    export function convert(oldStatus: FieldStatus, status: FieldStatus): FieldStatus {
        switch (oldStatus) {
            case FieldStatus.New:
                if (status == FieldStatus.Delete) {
                    status = FieldStatus.None
                } else {
                    status = FieldStatus.New
                }
                break
            case FieldStatus.Update:
                if (status === FieldStatus.New || status === FieldStatus.ChildUpdate) {
                    status = FieldStatus.Update
                }
                break
            case FieldStatus.ChildUpdate:
                if (status == FieldStatus.New) {
                    status = FieldStatus.Update
                }
                break
            case FieldStatus.Delete:
                if (status == FieldStatus.New) {
                    status = FieldStatus.Update
                } else if (status == FieldStatus.ChildUpdate) {
                    status = FieldStatus.Delete
                }
                break
        }
        return status
    }
}

export namespace BeanStatus {
    export function hasChanged(status: BeanStatus): boolean {
        return status !== BeanStatus.None && status !== BeanStatus.Invalid && status !== BeanStatus.AutoInit
    }
}
