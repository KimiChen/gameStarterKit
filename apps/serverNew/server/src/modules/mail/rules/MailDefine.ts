export class MailDefine {
    static readonly TYPE_SYS = 0 // 系统邮件

    static readonly TYPE_PAY_NOTICE = 998 // 离线充值到账邮件提醒，是展示奖励，不能领取

    /**
     * 其他游戏业务邮件定义在下方
     */
    static readonly TYPE_DEFAULT = 100 // 默认奖励类型
}
