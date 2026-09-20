import { Bean } from '@arthropoda/game-engine'
import { OnlyNet } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { MailItemBean } from './MailItemBean'

export class MailBean extends Bean {
    /**
     * 全局邮件领取的ids,格式如 [id => time]
     */
    gmailIds?: DiffMap<int, int>

    /**
     * 玩家邮件列表
     */
    @OnlyNet
    mails?: DiffMap<int, MailItemBean>
}
