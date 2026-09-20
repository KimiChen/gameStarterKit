import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uqid', ['uqid'], { unique: true })
@Index('timing_time', ['timingTime'], {})
@Entity('global_mail_timing')
export class GlobalMailTimingModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('int', {
        name: 'type',
        comment: '1全服邮件2玩家邮件3范围邮件4群发邮件5渠道邮件',
    })
    type!: number

    @Column('int', { name: 'uqid', unique: true, comment: '邮件的唯一id' })
    uqid!: number

    @Column('text', { name: 'title', comment: '邮件标题' })
    title!: string

    @Column('text', { name: 'content', comment: '邮件内容' })
    content!: string

    @Column('mediumtext', { name: 'awards', comment: '奖励' })
    awards!: string

    @Column('int', { name: 'past_time', comment: '邮件结束时间' })
    pastTime!: number

    @Column('text', { name: 'server_id', comment: '区服ids' })
    serverId!: string

    @Column('text', { name: 'role_id', comment: '哪些角色id不发' })
    roleId!: string

    @Column('int', { name: 'update_time', comment: '更新时间' })
    updateTime!: number

    @Column('int', {
        name: 'timing_time',
        comment: '定时时间',
        default: () => "'0'",
    })
    timingTime!: number

    @Column('int', {
        name: 'init_time_type',
        comment: '2发送时间之前的玩家可以领',
    })
    initTimeType!: number

    @Column('tinyint', {
        name: 'mail_status',
        comment: '邮件的状态',
        default: () => "'0'",
    })
    mailStatus!: number

    @Column('int', {
        name: 'total_num',
        comment: '总发送次数',
        default: () => "'0'",
    })
    totalNum!: number

    @Column('int', {
        name: 'suc_num',
        comment: '成功的次数',
        default: () => "'0'",
    })
    sucNum!: number

    @Column('int', {
        name: 'add_type',
        comment: '无痕操作的类型1 发放奖励 2 扣除奖励（只到0） 3 扣除奖励 （可负数）',
        default: () => "'0'",
    })
    addType!: number

    @Column('text', { name: 'mail_range', comment: '范围邮件的条件' })
    mailRange!: string

    @Column('int', {
        name: 'mail_more_status',
        comment: '发送成功后续的状态',
        default: () => "'0'",
    })
    mailMoreStatus!: number

    @Column('int', {
        name: 'mail_more_confirm',
        comment: '状态进行中的标识',
        default: () => "'0'",
    })
    mailMoreConfirm!: number

    @Column('text', { name: 'mail_more_info', comment: '状态操作的详情' })
    mailMoreInfo!: string

    static readonly f_id = 'id'

    static readonly f_type = 'type'

    static readonly f_uqid = 'uqid'

    static readonly f_title = 'title'

    static readonly f_content = 'content'

    static readonly f_awards = 'awards'

    static readonly f_past_time = 'past_time'

    static readonly f_server_id = 'server_id'

    static readonly f_role_id = 'role_id'

    static readonly f_update_time = 'update_time'

    static readonly f_timing_time = 'timing_time'

    static readonly f_init_time_type = 'init_time_type'

    static readonly f_mail_status = 'mail_status'

    static readonly f_total_num = 'total_num'

    static readonly f_suc_num = 'suc_num'

    static readonly f_add_type = 'add_type'

    static readonly f_mail_range = 'mail_range'

    static readonly f_mail_more_status = 'mail_more_status'

    static readonly f_mail_more_confirm = 'mail_more_confirm'

    static readonly f_mail_more_info = 'mail_more_info'
}
