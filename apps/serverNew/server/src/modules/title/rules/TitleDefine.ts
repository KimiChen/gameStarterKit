import { timestamp } from '@arthropoda/game-engine'

/**
 * 称号类型与有效期规则，语义与 config_game/title.json 的字段注释保持一致。
 */
export class TitleDefine {
    /** 冲榜类称号：有效期自榜单结算时开始计算，只能由榜单结算发放 */
    static readonly TYPE_RANK = 1

    /** 日常类称号：有效期自领取称号奖励时开始计算，玩家可以主动领取 */
    static readonly TYPE_DAILY = 2

    /** 永久有效的到期时间标记 */
    static readonly EXPIRE_FOREVER = 0

    /** 未佩戴称号的标记 */
    static readonly TITLE_NONE = 0

    /**
     * 计算称号到期时间
     * @param duration 配置的持续时间(秒)，非正数表示永久
     * @param startTime 有效期起点
     */
    static resolveExpire(duration: int, startTime: int): int {
        return duration > 0 ? startTime + duration : TitleDefine.EXPIRE_FOREVER
    }

    /**
     * 判断称号是否已过期
     * @param expire 到期时间，0 表示永久
     * @param now 当前时间
     */
    static isExpired(expire: int, now: int = timestamp()): boolean {
        return expire > 0 && expire <= now
    }
}
