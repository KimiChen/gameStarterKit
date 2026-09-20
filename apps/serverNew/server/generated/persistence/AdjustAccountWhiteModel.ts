import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('uniq_adjust_account_white_account', ['account'], { unique: true })
@Entity('adjust_account_white')
export class AdjustAccountWhiteModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'account', length: 64, unique: true, comment: 'Game account name' })
    account!: string

    @Column('varchar', { name: 'open_id', length: 64, default: '', comment: 'Resolved game openId' })
    openId!: string

    @Column('int', { name: 'last_login_time', default: () => "'0'", comment: 'Last login timestamp' })
    lastLoginTime!: number

    @Column('int', { name: 'add_time', comment: 'Whitelist add timestamp' })
    addTime!: number

    @Column('varchar', { name: 'created_by', length: 64, default: '', comment: 'SSO operator name' })
    createdBy!: string
    static readonly f_id = "id";
    static readonly f_account = "account";
    static readonly f_open_id = "open_id";
    static readonly f_last_login_time = "last_login_time";
    static readonly f_add_time = "add_time";
    static readonly f_created_by = "created_by";
}
