import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uniq_adjust_multiple_case_name', ['name'], { unique: true })
@Entity('adjust_multiple_case')
export class AdjustRobotBatchPlanModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', length: 64, comment: 'Batch plan name' })
    name!: string

    @Column('longtext', { name: 'data', comment: 'Batch users and tasks as JSON' })
    data!: string

    @Column('text', { name: 'description', comment: 'Batch plan description' })
    description!: string

    @Column('int', { name: 'create_time', comment: 'Create timestamp' })
    createTime!: number

    @Column('int', { name: 'update_time', comment: 'Update timestamp' })
    updateTime!: number
    static readonly f_id = "id";
    static readonly f_name = "name";
    static readonly f_data = "data";
    static readonly f_description = "description";
    static readonly f_create_time = "create_time";
    static readonly f_update_time = "update_time";
}
