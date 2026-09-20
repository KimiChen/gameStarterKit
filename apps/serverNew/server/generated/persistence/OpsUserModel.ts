import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('open_id', ['openId'], { unique: true })
@Entity('ops_user')
export class OpsUserModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', {
        name: 'open_id',
        unique: true,
        comment: '小游戏的openid',
        length: 64,
        default: () => "'0'",
    })
    openId!: string

    @Column('int', {
        name: 'ops_type',
        comment: '运营账号类型',
        default: () => "'0'",
    })
    opsType!: number

    @Column('int', {
        name: 'create_time',
        comment: '创建时间',
        default: () => "'0'",
    })
    createTime!: number

    @Column('int', { name: 'status', comment: '启用状态', default: () => "'0'" })
    status!: number

    @Column('varchar', { name: 'remark', comment: '备注', length: 255 })
    remark!: string

    static readonly f_id = 'id'

    static readonly f_open_id = 'open_id'

    static readonly f_ops_type = 'ops_type'

    static readonly f_create_time = 'create_time'

    static readonly f_status = 'status'

    static readonly f_remark = 'remark'
}
