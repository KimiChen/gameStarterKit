import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_gmconfig_1698401252000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS gm_config (
                id int(11) NOT NULL AUTO_INCREMENT,
                module varchar(64) NOT NULL DEFAULT '' COMMENT '模块的key',
                config_content varchar(2048) NOT NULL DEFAULT '' COMMENT '模块的配置详情:json格式',
                update_time int(11) NOT NULL DEFAULT '0' COMMENT '配置上次更新的时间',
                PRIMARY KEY (id),
                UNIQUE KEY module (module)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
