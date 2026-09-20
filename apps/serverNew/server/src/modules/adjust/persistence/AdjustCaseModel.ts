import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uniq_adjust_case_parent_name', ['parentId', 'name'], { unique: true })
@Index('idx_adjust_case_parent', ['parentId'])
@Index('idx_adjust_case_type', ['type'])
@Entity('adjust_case')
export class AdjustCaseModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', length: 64, comment: 'Robot case or group name' })
    name!: string

    @Column('bigint', { name: 'parent_id', default: 0, comment: 'Parent group id' })
    parentId!: number

    @Column('tinyint', { name: 'type', default: 0, comment: '0 group, 1 func, 2 websocket, 3 task' })
    type!: number

    @Column('varchar', { name: 'router', length: 160, default: '', comment: 'Function or websocket route' })
    router!: string

    @Column('longtext', { name: 'content', comment: 'Case content' })
    content!: string

    @Column('longtext', { name: 'param', comment: 'Case variables as JSON' })
    param!: string

    @Column('longtext', { name: 'ext', comment: 'Compiled task cache' })
    ext!: string

    @Column('int', { name: 'create_time', comment: 'Create timestamp' })
    createTime!: number

    @Column('int', { name: 'update_time', comment: 'Update timestamp' })
    updateTime!: number
    static readonly f_id = 'id'
    static readonly f_name = 'name'
    static readonly f_parent_id = 'parent_id'
    static readonly f_type = 'type'
    static readonly f_router = 'router'
    static readonly f_content = 'content'
    static readonly f_param = 'param'
    static readonly f_ext = 'ext'
    static readonly f_create_time = 'create_time'
    static readonly f_update_time = 'update_time'
}
