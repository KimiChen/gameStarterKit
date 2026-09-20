import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('user_id', ['userId'], {})
@Entity('center_guild')
export class CenterGuildModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'guild_id', comment: '帮会ID' })
    guildId!: number

    @Column('int', { name: 'sid', comment: '区服ID', default: () => "'0'" })
    sid!: number

    @Column('bigint', {
        name: 'user_id',
        comment: '帮主玩家ID',
        default: () => "'0'",
    })
    userId!: string

    @Column('varchar', { name: 'guild_name', comment: '帮会名称', length: 50 })
    guildName!: string

    @Column('int', {
        name: 'guild_create_time',
        comment: '帮会创建时间',
        default: () => "'0'",
    })
    guildCreateTime!: number

    static readonly f_guild_id = 'guild_id'

    static readonly f_sid = 'sid'

    static readonly f_user_id = 'user_id'

    static readonly f_guild_name = 'guild_name'

    static readonly f_guild_create_time = 'guild_create_time'
}
