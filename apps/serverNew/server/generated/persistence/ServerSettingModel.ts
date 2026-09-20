import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('SID_KEY', ['sId', 'sKey'], { unique: true })
@Index('s_key', ['sKey'], {})
@Entity('server_setting')
export class ServerSettingModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 's_key', comment: '设置的key', length: 32 })
    sKey!: string

    @Column('int', { name: 's_val', comment: '设置的val', default: () => "'0'" })
    sVal!: number

    @Column('int', { name: 's_id', comment: '区服ID', default: () => "'0'" })
    sId!: number

    @Column('int', { name: 'start_time', default: () => "'0'" })
    startTime!: number

    @Column('int', { name: 'end_time', default: () => "'0'" })
    endTime!: number

    @Column('varchar', { name: 'detail', length: 256 })
    detail!: string

    @Column('int', {
        name: 's_time',
        comment: '更新的时间',
        default: () => "'0'",
    })
    sTime!: number

    static readonly f_id = 'id'

    static readonly f_s_key = 's_key'

    static readonly f_s_val = 's_val'

    static readonly f_s_id = 's_id'

    static readonly f_start_time = 'start_time'

    static readonly f_end_time = 'end_time'

    static readonly f_detail = 'detail'

    static readonly f_s_time = 's_time'
}
