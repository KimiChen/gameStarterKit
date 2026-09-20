import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Entity('gift')
export class GiftModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('tinyint', {
        name: 'type',
        comment: '礼包类型:7-日礼包;8-周礼包;9-月礼包;',
        default: () => "'0'",
    })
    type!: number

    @Column('int', {
        name: 'recharge_id',
        comment: '充值档id',
        default: () => "'0'",
    })
    rechargeId!: number

    @Column('tinyint', {
        name: 'pay_type',
        comment: '支付类型:1-付费;2-元宝;3-看广告',
        default: () => "'1'",
    })
    payType!: number

    @Column('text', { name: 'awards', comment: '奖励' })
    awards!: string

    @Column('varchar', { name: 'desc', comment: '描述', length: 1024 })
    desc!: string

    @Column('text', { name: 'limit_content', comment: '购买限制' })
    limitContent!: string

    @Column('int', {
        name: 'total_limit',
        comment: '总次数',
        default: () => "'0'",
    })
    totalLimit!: number

    @Column('int', { name: 'vip', comment: 'vip等级', default: () => "'0'" })
    vip!: number

    @Column('int', {
        name: 'create_time',
        comment: '创建时间',
        default: () => "'0'",
    })
    createTime!: number

    @Column('int', { name: 'price', comment: '价格', default: () => "'0'" })
    price!: number

    @Column('int', {
        name: 'update_time',
        comment: '更新时间',
        default: () => "'0'",
    })
    updateTime!: number

    static readonly f_id = 'id'

    static readonly f_type = 'type'

    static readonly f_recharge_id = 'recharge_id'

    static readonly f_pay_type = 'pay_type'

    static readonly f_awards = 'awards'

    static readonly f_desc = 'desc'

    static readonly f_limit_content = 'limit_content'

    static readonly f_total_limit = 'total_limit'

    static readonly f_vip = 'vip'

    static readonly f_create_time = 'create_time'

    static readonly f_price = 'price'

    static readonly f_update_time = 'update_time'
}
