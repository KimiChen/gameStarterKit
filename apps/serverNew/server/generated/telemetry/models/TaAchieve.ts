/**
 * 模块名:成就
 * 事件名:成就
 * 说明:成就状态变更时推送
 */
export class TaAchieve {
    /**
     * 事件名称
     */
    public readonly EVENT_NAME: string = 'achieve'

    /**
     * 字段名:成就名称
     * 示例:我我我
     */
    public achieve_name: string = ''

    /**
     * 字段名:成就品质
     * 示例:绿色
     */
    public achieve_quality: string = ''

    /**
     * 字段名:成就描述
     * 示例:你你你
     */
    public achieve_describe: string = ''

    /**
     * 字段名:奖励内容
     * 示例:XXX
     */
    public awards_items: Array<any> = []

    /**
     * 字段名:资历点变更值
     * 示例:1
     */
    public change_qualification: number = 0

    /**
     * 字段名:资点变更后
     * 示例:2
     */
    public after_qualification: number = 0

    /**
     * 重要字段标识
     */
    public readonly _important: { [key: string]: string } = {}
}
