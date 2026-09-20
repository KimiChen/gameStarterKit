/**
 * 玩家封禁类型
 */
export class UserForbidType {
    /** 永久禁言 */
    static readonly FORBID_TIME = -1

    /** 禁言 */
    static readonly FORBID_CHAT = 1

    /** 登录封禁 */
    static readonly FORBID_LOGIN = 2

    /** 元宝封禁 */
    static readonly FORBID_GC = 3

    /** 铜钱封禁 */
    static readonly FORBID_SC = 4

    /** 资源封禁 */
    static readonly FORBID_CASH = 5

    /** 道具封禁 */
    static readonly FORBID_PROP = 6

    /** 改名封禁 */
    static readonly FORBID_CHANGE_NAME = 7

    static readonly TYPE_MAP: Record<number, string> = {
        [this.FORBID_CHAT]: '禁言',
        [this.FORBID_LOGIN]: '登录封禁',
        [this.FORBID_GC]: '钻石封禁',
        [this.FORBID_SC]: '金币封禁',
        [this.FORBID_CASH]: '资源封禁',
        [this.FORBID_PROP]: '道具封禁',
        [this.FORBID_CHANGE_NAME]: '改名封禁',
    }

    // 功能id对应的id
    static readonly REF_OPENID_CHANGE = {}
}
