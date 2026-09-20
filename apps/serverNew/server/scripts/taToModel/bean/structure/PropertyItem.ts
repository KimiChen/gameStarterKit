import { TraitAnnotation } from './TraitAnnotation'

export class PropertyItem extends TraitAnnotation {
    static readonly IS_STATIC = 1

    static readonly IS_CONST = 2

    /**
     * 属性名称
     */
    public name: string = ''

    /**
     * 值
     */
    public value: any

    /**
     * 数据类型
     */
    public type: string = ''

    /**
     * 数据特殊类型
     */
    public specType: string = ''

    /**
     * 注释
     */
    public annotation: string[] = []

    /**
     * 可见性
     */
    public visibility: string = 'public'

    /**
     * 静态属性或者常量 0普通属性 1静态属性 2常量
     */
    public staticOrConst: 0 | 1 | 2 = 0

    /**
     * 是否只读字段
     */
    public readonly: boolean = false
}
