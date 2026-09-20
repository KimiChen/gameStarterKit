import { MailItemBean } from '../mail/MailItemBean'

export interface MailBean {
    /**
     * 全局邮件领取的ids,格式如 [id => time]
     */
    gmailIds?: Map<int, int>
    /**
     * 玩家邮件列表
     */
    mails?: Map<int, MailItemBean>
}
