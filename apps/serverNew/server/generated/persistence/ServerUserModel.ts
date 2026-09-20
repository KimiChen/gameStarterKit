import { BaseEntity, Column, Entity, Index } from '@arthropoda/typeorm'

@Index('user_reg_id', ['userRegId', 'userSid'], { unique: true })
@Index('user_init_time', ['userInitTime'], {})
@Index('user_activity_time', ['userActivityTime'], {})
@Index('user_vip_exp', ['userVipExp'], {})
@Index('user_reg_device_id', ['userRegDeviceId'], {})
@Index('user_sc', ['userSc'], {})
@Index('user_gc', ['userGc'], {})
@Index('user_fp', ['userFp'], {})
@Index('user_name', ['userName'], {})
@Entity('server_user')
export class ServerUserModel extends BaseEntity {
    @Column('bigint', { primary: true, name: 'user_id' })
    userId!: string

    @Column('varchar', {
        name: 'user_reg_id',
        comment: '用户注册时候的平台id  (id__platformFlag__serverId)',
        length: 50,
    })
    userRegId!: string

    @Column('varchar', { name: 'user_name', comment: ' 用户名字', length: 50 })
    userName!: string

    @Column('varchar', { name: 'user_pic', length: 180 })
    userPic!: string

    @Column('varchar', { name: 'user_nick_name', length: 50 })
    userNickName!: string

    @Column('int', {
        name: 'user_init_time',
        comment: '用户第一次开始玩的时间',
        unsigned: true,
        default: () => "'0'",
    })
    userInitTime!: number

    @Column('int', {
        name: 'user_login_date',
        comment: '登陆日期',
        unsigned: true,
        default: () => "'0'",
    })
    userLoginDate!: number

    @Column('int', {
        name: 'user_login_days',
        comment: '登陆天数',
        default: () => "'0'",
    })
    userLoginDays!: number

    @Column('int', {
        name: 'user_activity_time',
        comment: '最后活跃时间',
        unsigned: true,
        default: () => "'0'",
    })
    userActivityTime!: number

    @Column('smallint', {
        name: 'user_sid',
        comment: '服务器id',
        unsigned: true,
        default: () => "'0'",
    })
    userSid!: number

    @Column('bigint', {
        name: 'user_gc',
        comment: '元宝',
        unsigned: true,
        default: () => "'0'",
    })
    userGc!: string

    @Column('decimal', {
        name: 'user_vip_exp',
        comment: '充值的钱数',
        precision: 11,
        scale: 2,
        default: () => "'0.00'",
    })
    userVipExp!: string

    @Column('int', { name: 'user_vip', comment: 'vip等级', default: () => "'0'" })
    userVip!: number

    @Column('int', {
        name: 'user_money',
        comment: '充值的金额',
        default: () => "'0'",
    })
    userMoney!: number

    @Column('int', {
        name: 'user_init_role',
        comment: '是否初始化了角色',
        default: () => "'0'",
    })
    userInitRole!: number

    @Column('int', {
        name: 'user_level',
        comment: '人物等级',
        default: () => "'0'",
    })
    userLevel!: number

    @Column('bigint', {
        name: 'user_fp',
        comment: '总战力',
        default: () => "'0'",
    })
    userFp!: string

    @Column('tinyint', {
        name: 'user_group',
        comment: '门派',
        default: () => "'0'",
    })
    userGroup!: number

    @Column('int', {
        name: 'user_ios',
        comment: '小游戏是否为ios',
        default: () => "'0'",
    })
    userIos!: number

    @Column('varchar', { name: 'user_ip', comment: '用户的id', length: 32 })
    userIp!: string

    @Column('varchar', { name: 'user_reg_ip', comment: '注册IP', length: 32 })
    userRegIp!: string

    @Column('varchar', {
        name: 'user_reg_device_id',
        comment: '注册设备',
        length: 64,
    })
    userRegDeviceId!: string

    @Column('tinyint', {
        name: 'user_reg_device_type',
        comment: '注册设备类型',
        default: () => "'0'",
    })
    userRegDeviceType!: number

    @Column('varchar', {
        name: 'client_ver',
        comment: '客户端版本号',
        length: 10,
    })
    clientVer!: string

    @Column('bigint', {
        name: 'user_sc',
        comment: '灵石（游戏货币）',
        unsigned: true,
        default: () => "'0'",
    })
    userSc!: string

    @Column('int', {
        name: 'lately_recharge_time',
        comment: '最后充值时间',
        default: () => "'0'",
    })
    latelyRechargeTime!: number

    static readonly f_user_id = 'user_id'

    static readonly f_user_reg_id = 'user_reg_id'

    static readonly f_user_name = 'user_name'

    static readonly f_user_pic = 'user_pic'

    static readonly f_user_nick_name = 'user_nick_name'

    static readonly f_user_init_time = 'user_init_time'

    static readonly f_user_login_date = 'user_login_date'

    static readonly f_user_login_days = 'user_login_days'

    static readonly f_user_activity_time = 'user_activity_time'

    static readonly f_user_sid = 'user_sid'

    static readonly f_user_gc = 'user_gc'

    static readonly f_user_vip_exp = 'user_vip_exp'

    static readonly f_user_vip = 'user_vip'

    static readonly f_user_money = 'user_money'

    static readonly f_user_init_role = 'user_init_role'

    static readonly f_user_level = 'user_level'

    static readonly f_user_fp = 'user_fp'

    static readonly f_user_group = 'user_group'

    static readonly f_user_ios = 'user_ios'

    static readonly f_user_ip = 'user_ip'

    static readonly f_user_reg_ip = 'user_reg_ip'

    static readonly f_user_reg_device_id = 'user_reg_device_id'

    static readonly f_user_reg_device_type = 'user_reg_device_type'

    static readonly f_client_ver = 'client_ver'

    static readonly f_user_sc = 'user_sc'

    static readonly f_lately_recharge_time = 'lately_recharge_time'
}
