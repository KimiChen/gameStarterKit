import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uniq_adjust_user_group_name', ['name'], { unique: true })
@Entity('adjust_user_group')
export class AdjustRobotUserGroupModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', length: 64, comment: 'Robot user group name' })
    name!: string

    @Column('longtext', { name: 'users', comment: 'Account or uid users as JSON' })
    users!: string

    @Column('int', { name: 'create_time', comment: 'Create timestamp' })
    createTime!: number

    @Column('int', { name: 'update_time', comment: 'Update timestamp' })
    updateTime!: number
    static readonly f_id = "id";
    static readonly f_name = "name";
    static readonly f_users = "users";
    static readonly f_create_time = "create_time";
    static readonly f_update_time = "update_time";
}
