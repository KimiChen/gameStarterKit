import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('order_txid_unique', ['orderTxid'], { unique: true })
@Index('order_billno_unique', ['orderBillno'], { unique: true })
@Index('user_id_order_dateline', ['userId', 'orderDateline'], {})
@Index('user_id', ['userId'], {})
@Index('order_billno', ['orderBillno'], {})
@Entity('center_order')
export class CenterOrderModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'order_id', unsigned: true })
    orderId!: number

    @Column('bigint', { name: 'user_id', default: () => "'0'" })
    userId!: string

    @Column('int', { name: 'order_itemid', default: () => "'0'" })
    orderItemid!: number

    @Column('int', {
        name: 'order_dateline',
        unsigned: true,
        default: () => "'0'",
    })
    orderDateline!: number

    @Column('varchar', {
        name: 'order_txid',
        unique: true,
        comment: '下单时的订单id',
        length: 64,
    })
    orderTxid!: string

    @Column('varchar', { name: 'order_billno', unique: true, length: 64 })
    orderBillno!: string

    @Column('int', { name: 'order_money', unsigned: true, default: () => "'0'" })
    orderMoney!: number

    @Column('decimal', {
        name: 'order_usd',
        comment: '美元',
        precision: 10,
        scale: 2,
        default: () => "'0.00'",
    })
    orderUsd!: string

    @Column('int', { name: 'order_jp', comment: '日元', default: () => "'0'" })
    orderJp!: number

    @Column('int', { name: 'order_gc', default: () => "'0'" })
    orderGc!: number

    @Column('int', {
        name: 'order_exp',
        comment: 'vip经验',
        default: () => "'0'",
    })
    orderExp!: number

    @Column('tinyint', { name: 'order_status', width: 1, default: () => "'0'" })
    orderStatus!: number

    @Column('smallint', {
        name: 'order_ext',
        comment: '是否是月卡',
        default: () => "'0'",
    })
    orderExt!: number

    @Column('int', {
        name: 'order_from_gm',
        comment: 'GM补单标识（1：正常补单不需要记录流水， 3：为真实补单 需要记录流水， 5：内部充值，不需要记录流水）',
        default: () => "'0'",
    })
    orderFromGm!: number

    @Column('tinyint', {
        name: 'order_ios',
        comment: '是否为ios',
        default: () => "'0'",
    })
    orderIos!: number

    @Column('varchar', {
        name: 'order_type',
        comment: '充值类型，xcx,wx',
        length: 30,
    })
    orderType!: string

    @Column('int', { name: 'order_sid', comment: '区服', default: () => "'0'" })
    orderSid!: number

    @Column('tinyint', {
        name: 'order_add',
        comment: '是否加上了奖励',
        default: () => "'0'",
    })
    orderAdd!: number

    @Column('int', {
        name: 'order_voided',
        comment: '退单状态',
        default: () => "'0'",
    })
    orderVoided!: number

    @Column('varchar', {
        name: 'order_transinfo',
        comment: '其他信息',
        length: 255,
    })
    orderTransinfo!: string

    @Column('int', { name: 'gift_id', comment: '礼包ID', default: () => "'0'" })
    giftId!: number

    @Column('varchar', {
        name: 'activity_name',
        comment: '礼包ID对应的活动名称',
        length: 255,
    })
    activityName!: string

    @Column('varchar', { name: 'extra', comment: '额外参数', length: 64 })
    extra!: string

    static readonly f_order_id = 'order_id'

    static readonly f_user_id = 'user_id'

    static readonly f_order_itemid = 'order_itemid'

    static readonly f_order_dateline = 'order_dateline'

    static readonly f_order_txid = 'order_txid'

    static readonly f_order_billno = 'order_billno'

    static readonly f_order_money = 'order_money'

    static readonly f_order_usd = 'order_usd'

    static readonly f_order_jp = 'order_jp'

    static readonly f_order_gc = 'order_gc'

    static readonly f_order_exp = 'order_exp'

    static readonly f_order_status = 'order_status'

    static readonly f_order_ext = 'order_ext'

    static readonly f_order_from_gm = 'order_from_gm'

    static readonly f_order_ios = 'order_ios'

    static readonly f_order_type = 'order_type'

    static readonly f_order_sid = 'order_sid'

    static readonly f_order_add = 'order_add'

    static readonly f_order_voided = 'order_voided'

    static readonly f_order_transinfo = 'order_transinfo'

    static readonly f_gift_id = 'gift_id'

    static readonly f_activity_name = 'activity_name'

    static readonly f_extra = 'extra'
}
