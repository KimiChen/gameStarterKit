import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uniq_adjust_prompt_type_name', ['type', 'name'], { unique: true })
@Entity('adjust_prompt')
export class AdjustPromptModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
    id!: number

    @Column('varchar', { name: 'type', length: 16, comment: 'Prompt category' })
    type!: string

    @Column('varchar', { name: 'name', length: 64, comment: 'Prompt file name' })
    name!: string

    @Column('longtext', { name: 'value', comment: 'Prompt content' })
    value!: string

    @Column('int', { name: 'version', default: () => "'1'", comment: 'Optimistic lock version' })
    version!: number

    @Column('int', { name: 'create_time', comment: 'Create timestamp' })
    createTime!: number

    @Column('int', { name: 'update_time', comment: 'Update timestamp' })
    updateTime!: number

    @Column('text', { name: 'description', comment: 'Prompt description' })
    description!: string

    @Column('varchar', { name: 'created_by', length: 64, default: '', comment: 'Create operator' })
    createdBy!: string

    @Column('varchar', { name: 'updated_by', length: 64, default: '', comment: 'Last update operator' })
    updatedBy!: string
    static readonly f_id = "id";
    static readonly f_type = "type";
    static readonly f_name = "name";
    static readonly f_value = "value";
    static readonly f_version = "version";
    static readonly f_create_time = "create_time";
    static readonly f_update_time = "update_time";
    static readonly f_description = "description";
    static readonly f_created_by = "created_by";
    static readonly f_updated_by = "updated_by";
}
