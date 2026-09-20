import { CenterHashJson } from '@arthropoda/game-engine'

/**
 * 只是对全局邮件对 @see GlobalMail 数据的缓存
 * 只加载未过期的邮件
 */
export class GlobalMailBean extends CenterHashJson {
    id: int = 0

    type: int = 0

    uqid: int = 0

    title: string = ''

    content: string = ''

    awards: string = ''

    pastTime: number = 0

    roleId: string = ''

    updateTime: number = 0

    initTimeType: number = 0

    mailRange: string = ''
}
