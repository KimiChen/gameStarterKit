import { GameError } from '@arthropoda/game-engine'

export class MailErrors {
    static readonly MailNoAward = new GameError(150001, '无奖励')

    static readonly MailHaveAward = new GameError(150002, '邮件奖励已领取')

    static readonly MailExpired = new GameError(150003, '邮件已过期')
}
