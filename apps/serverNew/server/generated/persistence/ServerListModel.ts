import { BaseEntity, Column, Entity } from '@arthropoda/typeorm'

@Entity('server_list')
export class ServerListModel extends BaseEntity {
    @Column('int', { primary: true, name: 's_id', comment: '服的id' })
    sId!: number

    @Column('varchar', { name: 's_name', comment: '服名称', length: 64 })
    sName!: string

    @Column('datetime', { name: 's_time', comment: '开服的时间' })
    sTime!: Date

    @Column('int', {
        name: 's_state',
        comment: '1 推荐 2火爆',
        default: () => "'0'",
    })
    sState!: number

    @Column('int', {
        name: 's_port',
        comment: '长连接port',
        default: () => "'0'",
    })
    sPort!: number

    @Column('tinyint', {
        name: 's_host',
        comment: '用的host',
        default: () => "'0'",
    })
    sHost!: number

    @Column('int', {
        name: 's_maintain_start',
        comment: '维护开始时间',
        default: () => "'0'",
    })
    sMaintainStart!: number

    @Column('int', {
        name: 's_maintain_end',
        comment: '维护结束时间',
        default: () => "'0'",
    })
    sMaintainEnd!: number

    @Column('int', {
        name: 's_interval_time',
        comment: '切换间隔时间',
        default: () => "'0'",
    })
    sIntervalTime!: number

    @Column('int', {
        name: 's_interval_start_time',
        comment: '开始设置的时间',
        default: () => "'0'",
    })
    sIntervalStartTime!: number

    @Column('int', { name: 's_recharge_resettime', default: () => "'0'" })
    sRechargeResettime!: number

    static readonly f_s_id = 's_id'

    static readonly f_s_name = 's_name'

    static readonly f_s_time = 's_time'

    static readonly f_s_state = 's_state'

    static readonly f_s_port = 's_port'

    static readonly f_s_host = 's_host'

    static readonly f_s_maintain_start = 's_maintain_start'

    static readonly f_s_maintain_end = 's_maintain_end'

    static readonly f_s_interval_time = 's_interval_time'

    static readonly f_s_interval_start_time = 's_interval_start_time'

    static readonly f_s_recharge_resettime = 's_recharge_resettime'
}
