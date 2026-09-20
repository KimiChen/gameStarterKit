/**
 * TaUserData
 * 数数用户数据
 */
export class TaUserData {
    /**
     * 账户id
     * 实际内容为角色id，及游戏内每个角色唯一的一个编号（例：30001060665）
     * @ta-var    string
     * @ta-method user_set
     */
    public static readonly ACCOUNT_ID: string = '#account_id'

    /**
     * 游戏账户id
     * 用户登录/登出时上报
     * @ta-var    string
     * @ta-method user_set
     */
    public static readonly OPEN_ID: string = 'open_id'

    /**
     * 当前角色名
     * 角色创建/名称修改时上报
     * @ta-var    string
     * @ta-method user_set
     */
    public static readonly ROLE_NAME: string = 'role_name'

    /**
     * 区服ID
     * 用户注册时上传所属服务器ID
     * @ta-var    string
     * @ta-method user_setOnce
     */
    public static readonly SERVER: string = 'server'

    /**
     * 帮会ID
     * 每次登出时设置
     * @ta-var    string
     * @ta-method user_set
     */
    public static readonly GUILD_ID: string = 'guild_id'

    /**
     * 注册时间
     * 角色新增时设置
     * @ta-var    number
     * @ta-method user_setOnce
     */
    public static readonly REG_TIME: string = '#reg_time'

    /**
     * 首次登录时间
     * 首次登录时记录
     * @ta-var    number
     * @ta-method user_setOnce
     */
    public static readonly FIRST_LOGIN_TIME: string = 'first_login_time'

    /**
     * 最后登录时间
     * 每次登录时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly LAST_LOGIN_TIME: string = 'last_login_time'

    /**
     * 首次充值时间
     * 首次充值时记录
     * @ta-var    number
     * @ta-method user_setOnce
     */
    public static readonly FIRST_PAY_TIME: string = 'first_pay_time'

    /**
     * 首充金额
     * 首次充值时记录
     * @ta-var    number
     * @ta-method user_setOnce
     */
    public static readonly FIRST_PAY_AMOUNT: string = 'first_pay_amount'

    /**
     * 最后充值时间
     * 每次充值时覆盖原来记录
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly LAST_PAY_TIME: string = 'last_pay_time'

    /**
     * 累计付费金额
     * 每次付费完成时累加
     * @ta-var    number
     * @ta-method user_add
     */
    public static readonly TOTAL_REVENUE: string = 'total_revenue'

    /**
     * 累计登录次数
     * 每次登录时累加
     * @ta-var    number
     * @ta-method user_add
     */
    public static readonly TOTAL_LOGIN: string = 'total_login'

    /**
     * 当前累计游戏时长
     * 每次登出时累加
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CURRENT_SESSION_TIME: string = 'current_session_time'

    /**
     * 当前元宝数
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CURRENT_GC: string = 'current_gc'

    /**
     * 当前银两数
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CURRENT_COIN: string = 'current_coin'

    /**
     * 当前等级
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CURRENT_ROLE_LEVEL: string = 'current_role_level'

    /**
     * 当前境界
     * 每次登出时设置
     * @ta-var    string
     * @ta-method user_set
     */
    public static readonly GROUP_POSITION: string = 'group_position'

    /**
     * 当前VIP等级
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CURRENT_VIP_LEVEL: string = 'current_vip_level'

    /**
     * 当前总评分
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CURRENT_FP: string = 'current_fp'

    /**
     * 主线任务ID
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly MAIN_TASK_ID: string = 'main_task_id'

    /**
     * 种族名称
     * 每次登出时设置
     * @ta-var    string
     * @ta-method user_set
     */
    public static readonly GROUP_NAME: string = 'group_name'

    /**
     * 法宝总评分
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly ARM_FP: string = 'arm_fp'

    /**
     * 功法总评分
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly CARD_FP: string = 'card_fp'

    /**
     * 装备总评分
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly EQIUP_FP: string = 'eqiup_fp'

    /**
     * 杀敌数
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly KILL_NUM: string = 'kill_num'

    /**
     * 成就等级
     * 每次登出时设置
     * @ta-var    number
     * @ta-method user_set
     */
    public static readonly ACHIEVE_LV: string = 'achieve_lv'

    /**
     */
    public static readonly DATA_FORMAT: { [key: string]: string | number } = {
        ['#account_id']: 'string',
        ['open_id']: 'string',
        ['role_name']: 'string',
        ['server']: 'string',
        ['guild_id']: 'string',
        ['#reg_time']: 'number',
        ['first_login_time']: 'number',
        ['last_login_time']: 'number',
        ['first_pay_time']: 'number',
        ['first_pay_amount']: 'number',
        ['last_pay_time']: 'number',
        ['total_revenue']: 'number',
        ['total_login']: 'number',
        ['current_session_time']: 'number',
        ['current_gc']: 'number',
        ['current_coin']: 'number',
        ['current_role_level']: 'number',
        ['group_position']: 'string',
        ['current_vip_level']: 'number',
        ['current_fp']: 'number',
        ['main_task_id']: 'number',
        ['group_name']: 'string',
        ['arm_fp']: 'number',
        ['card_fp']: 'number',
        ['eqiup_fp']: 'number',
        ['kill_num']: 'number',
        ['achieve_lv']: 'number',
    }

    /**
     */
    public static readonly METHOD: { [key: string]: string | number } = {
        ['#account_id']: 'user_set',
        ['open_id']: 'user_set',
        ['role_name']: 'user_set',
        ['server']: 'user_setOnce',
        ['guild_id']: 'user_set',
        ['#reg_time']: 'user_setOnce',
        ['first_login_time']: 'user_setOnce',
        ['last_login_time']: 'user_set',
        ['first_pay_time']: 'user_setOnce',
        ['first_pay_amount']: 'user_setOnce',
        ['last_pay_time']: 'user_set',
        ['total_revenue']: 'user_add',
        ['total_login']: 'user_add',
        ['current_session_time']: 'user_set',
        ['current_gc']: 'user_set',
        ['current_coin']: 'user_set',
        ['current_role_level']: 'user_set',
        ['group_position']: 'user_set',
        ['current_vip_level']: 'user_set',
        ['current_fp']: 'user_set',
        ['main_task_id']: 'user_set',
        ['group_name']: 'user_set',
        ['arm_fp']: 'user_set',
        ['card_fp']: 'user_set',
        ['eqiup_fp']: 'user_set',
        ['kill_num']: 'user_set',
        ['achieve_lv']: 'user_set',
    }
}
