import { BaseEntity, Column, Entity } from '@arthropoda/typeorm'

@Entity('server_list_config')
export class ServerListConfigModel extends BaseEntity {
    @Column('int', { primary: true, name: 'id' })
    id!: number

    @Column('int', {
        name: 'interval_time',
        comment: '间隔时间',
        default: () => "'0'",
    })
    intervalTime!: number

    @Column('int', {
        name: 'interval_start_time',
        comment: '开始时间',
        default: () => "'0'",
    })
    intervalStartTime!: number

    @Column('varchar', {
        name: 'server_id',
        comment: '自动切换的区服ids',
        length: 512,
    })
    serverId!: string

    @Column('int', {
        name: 'recommend_id',
        comment: '推荐的区服id',
        default: () => "'0'",
    })
    recommendId!: number

    @Column('int', {
        name: 'recommend_time',
        comment: '设置推荐的时间',
        default: () => "'0'",
    })
    recommendTime!: number

    @Column('int', {
        name: 'open_status',
        comment: '自动开服开关',
        default: () => "'0'",
    })
    openStatus!: number

    @Column('int', {
        name: 'open_server_id',
        comment: '自动开区id',
        default: () => "'0'",
    })
    openServerId!: number

    @Column('varchar', {
        name: 'open_start_time',
        comment: '自动开区开始时间点',
        length: 64,
    })
    openStartTime!: string

    @Column('varchar', {
        name: 'open_end_time',
        comment: '自动开区开始时间点',
        length: 64,
    })
    openEndTime!: string

    @Column('int', {
        name: 'open_people_num',
        comment: '自动开服人数',
        default: () => "'0'",
    })
    openPeopleNum!: number

    @Column('int', {
        name: 'last_server_open_num',
        comment: '开区条件2-上个区服人数',
        default: () => "'0'",
    })
    lastServerOpenNum!: number

    @Column('int', {
        name: 'last_server_pay_num',
        comment: '开区条件2-上个区服付费人数',
        default: () => "'0'",
    })
    lastServerPayNum!: number

    @Column('int', { name: 'zone_id', comment: '大区的ID', default: () => "'0'" })
    zoneId!: number

    static readonly f_id = 'id'

    static readonly f_interval_time = 'interval_time'

    static readonly f_interval_start_time = 'interval_start_time'

    static readonly f_server_id = 'server_id'

    static readonly f_recommend_id = 'recommend_id'

    static readonly f_recommend_time = 'recommend_time'

    static readonly f_open_status = 'open_status'

    static readonly f_open_server_id = 'open_server_id'

    static readonly f_open_start_time = 'open_start_time'

    static readonly f_open_end_time = 'open_end_time'

    static readonly f_open_people_num = 'open_people_num'

    static readonly f_last_server_open_num = 'last_server_open_num'

    static readonly f_last_server_pay_num = 'last_server_pay_num'

    static readonly f_zone_id = 'zone_id'
}
