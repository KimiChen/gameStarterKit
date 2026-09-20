export interface BeanInfo {
    /** 类名 */
    name: string
    fields: FieldInfo[]
}
export interface FieldInfo {
    /** 编码,从1开始 */
    id: int
    /** 属性字段名 */
    name: string
    /** 是否是DiffArray */
    repeated: boolean
    /** 是否是DiffMap */
    isMap: boolean
    /** 如果是map就为子对象的类名,否则为number,int,string等 */
    type: string
}
