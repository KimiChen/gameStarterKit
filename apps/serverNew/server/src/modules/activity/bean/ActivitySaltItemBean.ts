import { Bean } from '@arthropoda/game-engine'

export class ActivitySaltItemBean extends Bean {
    /**
     * 活动配置表的id
     */
    id: int = 0

    /**
     * 盐值
     */
    salt: string = ''

    /**
     * 活动名称
     */
    name: string = ''

    /**
     * 配置名称
     */
    configName: string = ''

    /**
     * 是否覆盖配置全表
     */
    configAll: boolean = false
}
