import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_gift_1714276855327 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
                CREATE TABLE gift (
                    id int NOT NULL AUTO_INCREMENT,
                    type tinyint NOT NULL DEFAULT '0' COMMENT '礼包类型:7-日礼包;8-周礼包;9-月礼包;',
                    recharge_id int NOT NULL DEFAULT '0' COMMENT '充值档id',
                    pay_type tinyint NOT NULL DEFAULT '1' COMMENT '支付类型:1-付费;2-元宝;3-看广告',
                    awards text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '奖励',
                    \`desc\` varchar(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '描述',
                    limit_content text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '购买限制',
                    total_limit int NOT NULL DEFAULT '0' COMMENT '总次数',
                    vip int NOT NULL DEFAULT '0' COMMENT 'vip等级',
                    create_time int NOT NULL DEFAULT '0' COMMENT '创建时间',
                    price int NOT NULL DEFAULT '0' COMMENT '价格',
                    update_time int NOT NULL DEFAULT '0' COMMENT '更新时间',
                    PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
                
              `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
