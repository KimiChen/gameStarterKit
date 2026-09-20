import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('open_id', ['openId'], { unique: true })
@Index('user_id', ['userId'], {})
@Index('device_id', ['deviceId'], {})
@Entity('center_user')
export class CenterUserModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', {
        name: 'open_id',
        unique: true,
        comment: '小游戏的openid',
        length: 64,
    })
    openId!: string

    @Column('varchar', { name: 'user_spid', comment: '用户的渠道id', length: 50 })
    userSpid!: string

    @Column('int', {
        name: 'user_init_time',
        comment: '第一次注册的时间',
        default: () => "'0'",
    })
    userInitTime!: number

    @Column('int', {
        name: 'user_money',
        comment: '充值的最大金额',
        default: () => "'0'",
    })
    userMoney!: number

    @Column('bigint', {
        name: 'user_id',
        comment: '第一个用户的id',
        default: () => "'0'",
    })
    userId!: string

    @Column('int', {
        name: 'user_platform',
        comment: '1 是安卓 2是ios',
        default: () => "'0'",
    })
    userPlatform!: number

    @Column('varchar', { name: 'device_id', comment: '设备id', length: 64 })
    deviceId!: string

    @Column('tinyint', {
        name: 'device_type',
        comment: '设备类型设备系统:1安卓 2ios 3windowphone',
        default: () => "'0'",
    })
    deviceType!: number

    @Column('int', {
        name: 'is_certificate',
        comment: '是否实名认证',
        default: () => "'0'",
    })
    isCertificate!: number

    static readonly f_id = 'id'

    static readonly f_open_id = 'open_id'

    static readonly f_user_spid = 'user_spid'

    static readonly f_user_init_time = 'user_init_time'

    static readonly f_user_money = 'user_money'

    static readonly f_user_id = 'user_id'

    static readonly f_user_platform = 'user_platform'

    static readonly f_device_id = 'device_id'

    static readonly f_device_type = 'device_type'

    static readonly f_is_certificate = 'is_certificate'
}
