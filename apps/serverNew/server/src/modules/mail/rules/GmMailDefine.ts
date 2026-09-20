export class GmMailDefine {
    static readonly TYPE_SERVER = 1 // 1全服邮件  针对区服

    static readonly TYPE_ROLE = 2 // 2玩家邮件  针对几个role发相同的奖励

    static readonly TYPE_RANGE = 3 // 3范围邮件

    static readonly TYPE_MUTI = 4 // 4群发邮件

    static readonly TYPE_CHANNEL = 5 // 5渠道邮件

    static readonly TYPE_TRACELESS_ROLE = 11 // 无痕玩家

    static readonly TYPE_TRACELESS_MUTI = 12 // 无痕群发

    static readonly STATUS_DEFAULT = 0 // gm未执行,默认

    static readonly STATUS_SUCCESS = 1 // gm执行成功

    static readonly STATUS_FAIL = 2 // 执行失败

    static readonly STATUS_CANCEL = 3 // 取消推送

    static readonly MORE_STATUS_BLOCK = 1 // 屏蔽邮件

    static readonly MORE_STATUS_RESUME = 2 // 恢复邮件

    static readonly MORE_STATUS_DEL = 3 // 邮件删除

    static readonly MORE_SUCCESS = 1 //成功

    static readonly MORE_FAIL = 2 // 失败

    static readonly MORE_DOING = 10 // 正在处理

    static readonly LOG_TYPE_ROLE = 1 // log类型, sendmail type role

    static readonly LOG_TYPE_MIX = 2 // log类型, sendmail type mix

    static readonly LOG_TRACELESS_ROLE = 3 // log类型, traceless type role

    static readonly LOG_TRACELESS_MIX = 4 // log类型, traceless type mix

    static readonly ADD_TYPE_AWARD = 1 // 发放奖励

    static readonly ADD_TYPE_REDUCE0 = 2 // 扣除（只到0)

    static readonly ADD_TYPE_REDUCE_REAL = 3 // 扣除（可负数）
}
