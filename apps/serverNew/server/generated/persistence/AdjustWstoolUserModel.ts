import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Entity('adjust_wstool_user')
export class AdjustWstoolUserModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'name', length: 64, unique: true, comment: 'SSO account name' })
    name!: string

    @Column('varchar', { name: 'chinese_name', length: 64, comment: 'Display name' })
    chineseName!: string
    static readonly f_id = "id";
    static readonly f_name = "name";
    static readonly f_chinese_name = "chinese_name";
}
