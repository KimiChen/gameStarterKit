import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_server_list_config_1714276855326 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS server_list_config;`)
        await queryRunner.query(`
            CREATE TABLE server_list_config (
                id int NOT NULL ,
                interval_time int NOT NULL DEFAULT '0' COMMENT '间隔时间',
                interval_start_time int NOT NULL DEFAULT '0' COMMENT '开始时间',
                server_id varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '自动切换的区服ids',
                recommend_id int NOT NULL DEFAULT '0' COMMENT '推荐的区服id',
                recommend_time int NOT NULL DEFAULT '0' COMMENT '设置推荐的时间',
                open_status int NOT NULL DEFAULT '0' COMMENT '自动开服开关',
                open_server_id int NOT NULL DEFAULT '0' COMMENT '自动开区id',
                open_start_time varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '自动开区开始时间点',
                open_end_time varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '自动开区开始时间点',
                open_people_num int NOT NULL DEFAULT '0' COMMENT '自动开服人数',
                last_server_open_num int NOT NULL DEFAULT '0' COMMENT '开区条件2-上个区服人数',
                last_server_pay_num int NOT NULL DEFAULT '0' COMMENT '开区条件2-上个区服付费人数',
                zone_id int NOT NULL DEFAULT '0' COMMENT '大区的ID',
                PRIMARY KEY (id)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
              `)
        await queryRunner.query(`
              insert into server_list_config (id)  values (1);
              `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
