import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uqid', ['uqid'], { unique: true })
@Index('past_time', ['pastTime'], {})
@Entity('global_mail')
export class GlobalMailModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('int', {
        name: 'type',
        comment: '1全服邮件2玩家邮件3范围邮件4群发邮件5渠道邮件',
        default: () => "'0'",
    })
    type!: number

    @Column('int', {
        name: 'uqid',
        unique: true,
        comment: '邮件的唯一id',
        default: () => "'0'",
    })
    uqid!: number

    @Column('text', { name: 'title', comment: '邮件标题' })
    title!: string

    @Column('text', { name: 'content', comment: '邮件内容' })
    content!: string

    @Column('varchar', { name: 'awards', comment: '奖励', length: 4096 })
    awards!: string

    @Column('int', {
        name: 'past_time',
        comment: '邮件结束时间',
        default: () => "'0'",
    })
    pastTime!: number

    @Column('text', { name: 'server_id', comment: '区服ids' })
    serverId!: string

    @Column('text', { name: 'role_id', comment: '哪些角色id不发' })
    roleId!: string

    @Column('int', {
        name: 'update_time',
        comment: '更新时间',
        default: () => "'0'",
    })
    updateTime!: number

    @Column('int', {
        name: 'init_time_type',
        comment: '2之前发送前的玩家可以领取',
        default: () => "'0'",
    })
    initTimeType!: number

    @Column('text', { name: 'mail_range', comment: '范围邮件的条件' })
    mailRange!: string

    @Column('int', {
        name: 'more_status',
        comment: '屏蔽等状态',
        default: () => "'0'",
    })
    moreStatus!: number

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

    static readonly f_init_time_type = 'init_time_type'

    static readonly f_mail_range = 'mail_range'

    static readonly f_more_status = 'more_status'
}
