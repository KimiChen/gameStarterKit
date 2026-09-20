export class GiftDefine {
    //#region 系统礼包类型
    /** 每日 */
    static readonly SYS_TYPE_DAILY = 1

    /** 终身 */
    static readonly SYS_TYPE_LIFE = 2
    //#endregion

    //#region 支付类型
    /** 现金 */
    static readonly PAY_TYPE_CASH = 1

    /** 仙玉 */
    static readonly PAY_TYPE_GC = 2

    /** 广告-可跳过 */
    static readonly PAY_TYPE_AD = 3

    /** 免费 */
    static readonly PAY_TYPE_FREE = 4

    /** 广告-必看 */
    static readonly PAY_TYPE_AD_NECESSARY = 5

    /** @var int[] 非现金类型 */
    static readonly NO_PAY_CASH_MAP = [
        this.PAY_TYPE_GC,
        this.PAY_TYPE_AD,
        this.PAY_TYPE_FREE,
        this.PAY_TYPE_AD_NECESSARY,
    ]

    /** @var int[] 广告类型 */
    static readonly PAY_BY_AD = [this.PAY_TYPE_AD, this.PAY_TYPE_AD_NECESSARY]
    // #endregion

    //#region 限购类型
    /** @var int 不限购 */
    static readonly LIMIT_TYPE_NO = 0

    /** @var int 总计限购 */
    static readonly LIMIT_TYPE_TOTAL = 1

    /** @var int 每日限购 */
    static readonly LIMIT_TYPE_DAILY = 2
    // #endregion
}
