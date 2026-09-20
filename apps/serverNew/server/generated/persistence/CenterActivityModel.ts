import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('name', ['name'], {})
@Index('open_ts', ['openTs'], {})
@Index('close_ts', ['closeTs'], {})
@Entity('center_activity')
export class CenterActivityModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', comment: '活动关键字', length: 32 })
    name!: string

    @Column('tinyint', {
        name: 'type',
        comment: '活动类型1服务启动导入2后台导入3后台导入不展示',
        default: () => "'0'",
    })
    type!: number

    @Column('int', {
        name: 'open_ts',
        comment: '活动启动时间',
        default: () => "'0'",
    })
    openTs!: number

    @Column('int', {
        name: 'close_ts',
        comment: '活动关闭时间',
        default: () => "'0'",
    })
    closeTs!: number

    @Column('int', {
        name: 'start_ts',
        comment: '活动开始时间',
        default: () => "'0'",
    })
    startTs!: number

    @Column('int', {
        name: 'end_ts',
        comment: '活动结束时间',
        default: () => "'0'",
    })
    endTs!: number

    @Column('int', {
        name: 'award_ts',
        comment: '活动开始领奖时间',
        default: () => "'0'",
    })
    awardTs!: number

    @Column('varchar', { name: 'salt', comment: '活动MD5加密标识', length: 32 })
    salt!: string

    @Column('tinyint', {
        name: 'status',
        comment: '1正常2删除',
        default: () => "'1'",
    })
    status!: number

    @Column('longtext', { name: 'activity_conf', comment: '活动配置' })
    activityConf!: string

    @Column('longtext', { name: 'activity_detail', comment: '奖励的具体配置' })
    activityDetail!: string

    @Column('varchar', {
        name: 'plan_code',
        comment: '后台活动导入标识码',
        length: 32,
    })
    planCode!: string

    @Column('int', {
        name: 'del_status',
        comment: '删除的状态值，100是成功,其他值失败',
        default: () => "'0'",
    })
    delStatus!: number

    @Column('varchar', { name: 'server_id', comment: '跨服的区服', length: 2048 })
    serverId!: string

    @Column('tinyint', {
        name: 'is_award',
        comment: '是否发奖',
        width: 1,
        default: () => "'0'",
    })
    isAward!: number

    @Column('int', {
        name: 'daily_start_time',
        comment: '活动每日开启时间',
        default: () => "'0'",
    })
    dailyStartTime!: number

    @Column('int', {
        name: 'daily_end_time',
        comment: '活动每日结束时间',
        default: () => "'0'",
    })
    dailyEndTime!: number

    @Column('int', {
        name: 'cross_server_id',
        comment: '跨服服务id',
        default: () => "'0'",
    })
    crossServerId!: number

    static readonly f_id = 'id'

    static readonly f_name = 'name'

    static readonly f_type = 'type'

    static readonly f_open_ts = 'open_ts'

    static readonly f_close_ts = 'close_ts'

    static readonly f_start_ts = 'start_ts'

    static readonly f_end_ts = 'end_ts'

    static readonly f_award_ts = 'award_ts'

    static readonly f_salt = 'salt'

    static readonly f_status = 'status'

    static readonly f_activity_conf = 'activity_conf'

    static readonly f_activity_detail = 'activity_detail'

    static readonly f_plan_code = 'plan_code'

    static readonly f_del_status = 'del_status'

    static readonly f_server_id = 'server_id'

    static readonly f_is_award = 'is_award'

    static readonly f_daily_start_time = 'daily_start_time'

    static readonly f_daily_end_time = 'daily_end_time'

    static readonly f_cross_server_id = 'cross_server_id'
}
