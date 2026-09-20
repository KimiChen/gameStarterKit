import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uniq_adjust_env_name', ['name'], { unique: true })
@Entity('adjust_env')
export class AdjustRobotEnvironmentModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', length: 64, comment: 'Environment variable name' })
    name!: string

    @Column('varchar', { name: 'type', length: 16, default: 'string', comment: 'Value type' })
    type!: string

    @Column('longtext', { name: 'default_value', comment: 'Default value' })
    defaultValue!: string

    @Column('text', { name: 'description', comment: 'Variable description' })
    description!: string

    @Column('int', { name: 'create_time', comment: 'Create timestamp' })
    createTime!: number

    @Column('int', { name: 'update_time', comment: 'Update timestamp' })
    updateTime!: number
    static readonly f_id = "id";
    static readonly f_name = "name";
    static readonly f_type = "type";
    static readonly f_default_value = "default_value";
    static readonly f_description = "description";
    static readonly f_create_time = "create_time";
    static readonly f_update_time = "update_time";
}
