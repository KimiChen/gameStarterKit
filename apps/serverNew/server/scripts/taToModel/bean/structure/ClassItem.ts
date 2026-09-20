import { MethodItem } from './MethodItem'
import { PropertyItem } from './PropertyItem'
import { TraitAnnotation } from './TraitAnnotation'

export class ClassItem extends TraitAnnotation {
    /**
     * 命名空间
     */
    public namespace: string = ''

    /**
     * 类名
     */
    public name: string = ''

    /**
     * 属性值
     */
    public properties: { [key: string]: PropertyItem } = {}

    /**
     * 方法
     */
    public methods: MethodItem[] = []

    /**
     * 注释
     */
    public annotation: string[] = []

    /**
     * 类保存目录
     */
    public savePath: string = ''

    /**
     * use 引入的类
     */
    public uses: string[] = []

    getProperties() {
        const values = Object.values(this.properties)
        return values[Symbol.iterator]()
    }
}
