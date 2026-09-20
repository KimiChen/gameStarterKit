import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_user_forbid_1719828152180 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
                CREATE TABLE user_forbid (
                    id int NOT NULL AUTO_INCREMENT,
                    account varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '账号',
                    account_type tinyint NOT NULL DEFAULT '1' COMMENT '账号类型1角色ID2玩家账号3设备号',
                    type tinyint NOT NULL DEFAULT '0' COMMENT '1禁言2封号3世界boss副本4门派精英副本5排行榜6华山论剑7大师兄8武林大会9使用货币10背包11禁止改名12禁止易容13禁止使用资源14大雁塔',
                    end_time int NOT NULL DEFAULT '0' COMMENT '封禁的结算时间-到什么时候结束 -1为永久',
                    c_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY account (account)
                  )ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
                `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
