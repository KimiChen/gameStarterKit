import { TraitAnnotation } from './TraitAnnotation'

export class MethodParamItem extends TraitAnnotation {
    /**
     * 参数序号
     */
    public index: int = 0

    /**
     * 参数名称
     */
    public name: string = ''

    /**
     * 默认值
     */
    public default: any = ''

    /**
     * 参数数据类型
     */
    public type: string = ''

    /**
     * 注释说明
     */
    public annotation: string[] = []
}
