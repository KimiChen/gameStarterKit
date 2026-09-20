import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('account', ['account'], {})
@Entity('user_forbid')
export class UserForbidModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'account', comment: '账号', length: 64 })
    account!: string

    @Column('tinyint', {
        name: 'account_type',
        comment: '账号类型1角色ID2玩家账号3设备号',
        default: () => "'1'",
    })
    accountType!: number

    @Column('tinyint', {
        name: 'type',
        comment:
            '1禁言2封号3世界boss副本4门派精英副本5排行榜6华山论剑7大师兄8武林大会9使用货币10背包11禁止改名12禁止易容13禁止使用资源14大雁塔',
        default: () => "'0'",
    })
    type!: number

    @Column('int', {
        name: 'end_time',
        comment: '封禁的结算时间-到什么时候结束 -1为永久',
        default: () => "'0'",
    })
    endTime!: number

    @Column('datetime', { name: 'c_time', default: () => 'CURRENT_TIMESTAMP' })
    cTime!: Date

    static readonly f_id = 'id'

    static readonly f_account = 'account'

    static readonly f_account_type = 'account_type'

    static readonly f_type = 'type'

    static readonly f_end_time = 'end_time'

    static readonly f_c_time = 'c_time'
}
