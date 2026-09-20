import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uqid', ['uqid', 'userId'], { unique: true })
@Index('user_id', ['userId'], {})
@Entity('mail_role_log')
export class MailRoleLogModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('int', { name: 'uqid', comment: '平台的唯一id' })
    uqid!: number

    @Column('bigint', { name: 'user_id', comment: '对应的用户id' })
    userId!: string

    @Column('int', { name: 'log_time', comment: '入库的时间' })
    logTime!: number

    @Column('int', { name: 'action_time', comment: '执行的时间' })
    actionTime!: number

    @Column('int', {
        name: 'action_status',
        comment: '0未执行 1 成功 2 执行失败',
    })
    actionStatus!: number

    @Column('varchar', { name: 'fail_msg', comment: '失败的原因', length: 512 })
    failMsg!: string

    @Column('int', { name: 'action_type', comment: '类型' })
    actionType!: number

    @Column('text', { name: 'awards', comment: '奖励' })
    awards!: string

    static readonly f_id = 'id'

    static readonly f_uqid = 'uqid'

    static readonly f_user_id = 'user_id'

    static readonly f_log_time = 'log_time'

    static readonly f_action_time = 'action_time'

    static readonly f_action_status = 'action_status'

    static readonly f_fail_msg = 'fail_msg'

    static readonly f_action_type = 'action_type'

    static readonly f_awards = 'awards'
}
