import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('start_time', ['startTime'], {})
@Index('end_time', ['endTime'], {})
@Index('uqid', ['uqid'], {})
@Index('update_time', ['updateTime'], {})
@Index('op_user_id', ['opUserId'], {})
@Index('sort', ['sort'], {})
@Entity('gonggao_login')
export class GonggaoLoginModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('int', { name: 'start_time' })
    startTime!: number

    @Column('int', { name: 'end_time' })
    endTime!: number

    @Column('varchar', { name: 'title', length: 256 })
    title!: string

    @Column('text', { name: 'content' })
    content!: string

    @Column('int', { name: 'uqid', comment: '版本号' })
    uqid!: number

    @Column('int', { name: 'update_time', comment: '更新的时间戳' })
    updateTime!: number

    @Column('int', { name: 'is_close', comment: '关闭状态' })
    isClose!: number

    @Column('int', { name: 'op_user_id', comment: '平台操作人id' })
    opUserId!: number

    @Column('int', { name: 'sort', unsigned: true, default: () => "'0'" })
    sort!: number

    @Column('smallint', { name: 'type', unsigned: true, default: () => "'0'" })
    type!: number

    @Column('varchar', { name: 'img', length: 255 })
    img!: string

    static readonly f_id = 'id'

    static readonly f_start_time = 'start_time'

    static readonly f_end_time = 'end_time'

    static readonly f_title = 'title'

    static readonly f_content = 'content'

    static readonly f_uqid = 'uqid'

    static readonly f_update_time = 'update_time'

    static readonly f_is_close = 'is_close'

    static readonly f_op_user_id = 'op_user_id'

    static readonly f_sort = 'sort'

    static readonly f_type = 'type'

    static readonly f_img = 'img'
}
