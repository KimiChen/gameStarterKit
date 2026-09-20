import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('user_id_dateline', ['userId', 'mDateline'], {})
@Index('uqid', ['uqid'], {})
@Index('m_past_time_index', ['mPastTime'], {})
@Entity('mail')
export class MailModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'm_id' })
    mId!: number

    @Column('bigint', { name: 'user_id', default: () => "'0'" })
    userId!: string

    @Column('int', {
        name: 'm_type',
        comment: '信件类型>100读配置',
        default: () => "'0'",
    })
    mType!: number

    @Column('varchar', { name: 'm_from', comment: '来自那里', length: 28 })
    mFrom!: string

    @Column('varchar', { name: 'm_from_name', comment: '来自谁', length: 32 })
    mFromName!: string

    @Column('int', {
        name: 'm_from_cid',
        comment: '好友头像id',
        default: () => "'0'",
    })
    mFromCid!: number

    @Column('text', { name: 'm_title', comment: '标题' })
    mTitle!: string

    @Column('text', { name: 'm_content', comment: '内容' })
    mContent!: string

    @Column('varchar', { name: 'm_award', comment: '奖励', length: 4096 })
    mAward!: string

    @Column('varchar', {
        name: 'm_award_show',
        comment: '只是用于展示奖励用，不能领取',
        length: 4096,
    })
    mAwardShow!: string

    @Column('tinyint', {
        name: 'm_is_award',
        comment: '是否领取1是0否',
        width: 1,
        default: () => "'0'",
    })
    mIsAward!: number

    @Column('tinyint', {
        name: 'm_is_read',
        comment: '是否阅读',
        default: () => "'0'",
    })
    mIsRead!: number

    @Column('int', { name: 'm_dateline', comment: '时间', default: () => "'0'" })
    mDateline!: number

    @Column('int', {
        name: 'm_award_time',
        comment: '领奖时间',
        default: () => "'0'",
    })
    mAwardTime!: number

    @Column('text', { name: 'm_params', comment: '参数' })
    mParams!: string

    @Column('int', {
        name: 'm_past_time',
        comment: '邮件过期时间',
        default: () => "'0'",
    })
    mPastTime!: number

    @Column('int', {
        name: 'uqid',
        comment: '对应后台的邮件id',
        default: () => "'0'",
    })
    uqid!: number

    @Column('int', {
        name: 'm_more_status',
        comment: '1屏蔽3删除',
        default: () => "'0'",
    })
    mMoreStatus!: number

    static readonly f_m_id = 'm_id'

    static readonly f_user_id = 'user_id'

    static readonly f_m_type = 'm_type'

    static readonly f_m_from = 'm_from'

    static readonly f_m_from_name = 'm_from_name'

    static readonly f_m_from_cid = 'm_from_cid'

    static readonly f_m_title = 'm_title'

    static readonly f_m_content = 'm_content'

    static readonly f_m_award = 'm_award'

    static readonly f_m_award_show = 'm_award_show'

    static readonly f_m_is_award = 'm_is_award'

    static readonly f_m_is_read = 'm_is_read'

    static readonly f_m_dateline = 'm_dateline'

    static readonly f_m_award_time = 'm_award_time'

    static readonly f_m_params = 'm_params'

    static readonly f_m_past_time = 'm_past_time'

    static readonly f_uqid = 'uqid'

    static readonly f_m_more_status = 'm_more_status'
}
