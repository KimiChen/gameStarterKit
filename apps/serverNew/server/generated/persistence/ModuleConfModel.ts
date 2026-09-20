import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('s_id', ['sid'], {})
@Entity('module_conf')
export class ModuleConfModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('int', { name: 'sid', default: () => "'0'" })
    sid!: number

    @Column('varchar', { name: 'name', length: 25 })
    name!: string

    @Column('tinyint', {
        name: 'type',
        comment: '功能类型',
        default: () => "'0'",
    })
    type!: number

    @Column('tinyint', {
        name: 'status',
        comment: '1开启0关闭',
        default: () => "'1'",
    })
    status!: number

    @Column('datetime', { name: 'c_time', default: () => 'CURRENT_TIMESTAMP' })
    cTime!: Date

    static readonly f_id = 'id'

    static readonly f_sid = 'sid'

    static readonly f_name = 'name'

    static readonly f_type = 'type'

    static readonly f_status = 'status'

    static readonly f_c_time = 'c_time'
}
