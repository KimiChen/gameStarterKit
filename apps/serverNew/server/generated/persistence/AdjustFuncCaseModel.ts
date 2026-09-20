import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Entity('adjust_func_case')
export class AdjustFuncCaseModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', length: 64, comment: 'Case or group name' })
    name!: string

    @Column('tinyint', { name: 'type', comment: '0 group, 1 case', default: () => "'0'" })
    type!: number

    @Column('bigint', { name: 'parent_id', comment: 'Parent group id', default: () => "'0'" })
    parentId!: number

    @Column('json', { name: 'user', comment: 'Batch account configuration' })
    user!: Record<string, unknown>

    @Column('json', { name: 'func', comment: 'Custom function steps' })
    func!: unknown[]

    @Column('int', { name: 'sort', comment: 'Sibling order', default: () => "'0'" })
    sort!: number
    static readonly f_id = "id";
    static readonly f_name = "name";
    static readonly f_type = "type";
    static readonly f_parent_id = "parent_id";
    static readonly f_user = "user";
    static readonly f_func = "func";
    static readonly f_sort = "sort";
}
