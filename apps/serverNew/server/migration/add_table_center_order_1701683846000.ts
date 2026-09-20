import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_center_order_1701683846000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(` 
        CREATE TABLE IF NOT EXISTS center_order (
            order_id int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL DEFAULT '0',
            order_itemid int(11) NOT NULL DEFAULT '0',
            order_dateline int(10) UNSIGNED NOT NULL DEFAULT '0',
            order_txid varchar(64) NOT NULL DEFAULT '' COMMENT '下单时的订单id',
            order_billno varchar(64) NOT NULL DEFAULT '',
            order_money int(10) UNSIGNED NOT NULL DEFAULT '0',
            order_usd decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '美元',
            order_jp int(11) NOT NULL DEFAULT '0' COMMENT '日元',
            order_gc int(11) NOT NULL DEFAULT '0',
            order_exp int(11) NOT NULL DEFAULT '0' COMMENT 'vip经验',
            order_status tinyint(1) NOT NULL DEFAULT '0',
            order_ext smallint(6) NOT NULL DEFAULT '0' COMMENT '是否是月卡',
            order_from_gm int(11) NOT NULL DEFAULT '0' COMMENT 'GM补单标识（1：正常补单不需要记录流水， 3：为真实补单 需要记录流水， 5：内部充值，不需要记录流水）',
            order_ios tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否为ios',
            order_type varchar(30) NOT NULL DEFAULT '' COMMENT '充值类型，xcx,wx',
            order_sid int(11) NOT NULL DEFAULT '0' COMMENT '区服',
            order_add tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否加上了奖励',
            order_voided int(11) NOT NULL DEFAULT '0' COMMENT '退单状态',
            order_transinfo varchar(255) NOT NULL DEFAULT '' COMMENT '其他信息',
            gift_id int(11) NOT NULL DEFAULT '0' COMMENT '礼包ID',
            activity_name varchar(255) NOT NULL DEFAULT '' COMMENT '礼包ID对应的活动名称',
            extra varchar(64) NOT NULL DEFAULT '' COMMENT '额外参数',
            PRIMARY KEY (order_id),
            UNIQUE KEY order_txid_unique (order_txid),
            UNIQUE KEY order_billno_unique (order_billno),
            KEY user_id_order_dateline (user_id,order_dateline),
            KEY user_id (user_id),
            KEY order_billno (order_billno)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
