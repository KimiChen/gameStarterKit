import { MethodParamItem } from './MethodParamItem'
import { TraitAnnotation } from './TraitAnnotation'

export class MethodItem extends TraitAnnotation {
    /**
     * use 引入的类
     */
    public uses: string[] = []

    /**
     * 事件名称
     */
    public eventName: string = ''

    /**
     * 方法名称
     */
    public name: string = ''

    /**
     * 注释
     */
    public annotation: string[] = []

    /**
     * 可见性
     */
    public visibility: string = 'public'

    /**
     * 是否是静态方法
     */
    public isStatic: boolean = false

    /**
     * 参数列表
     */
    public params: MethodParamItem[] = []

    /**
     * 返回类型
     */
    public returnType: string = ''

    /**
     * 函数体
     */
    public body: string = ''
}
