import { FieldItem } from './FieldItem'

/**
 * 事件对象
 */
export class EventItem {
    /**
     * 事件英文名
     */
    public nameEn: string = ''

    /**
     * 事件显示名
     */
    public nameCn: string = ''

    /**
     * 事件说明
     */
    public desc: string = ''

    /**
     * 字段
     */
    public fields: { [key: string]: FieldItem } = {}

    /**
     * 模块名
     */
    public moduleName: string = ''
}
