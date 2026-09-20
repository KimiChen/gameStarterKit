/**
 * 表示一个字段项，包含各种属性
 */
export class FieldItem {
    /**
     * 字段项的中文名
     */
    public nameCn: string = ''

    /**
     * 字段项的英文名
     */
    public nameEn: string = ''

    /**
     * 字段项的描述
     */
    public desc: string = ''

    /**
     * 字段项的类型
     */
    public type: string = ''

    /**
     * 字段项的具体类型
     */
    public specType: string = ''

    /**
     * 字段项是否重要的标志
     */
    public importance: boolean = false
}
