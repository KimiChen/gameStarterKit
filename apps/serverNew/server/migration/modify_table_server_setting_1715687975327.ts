import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class modify_table_server_setting_1715687975327 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        DROP TABLE IF EXISTS server_setting;`)
        await queryRunner.query(`
        CREATE TABLE server_setting (
            id int(11) NOT NULL AUTO_INCREMENT,
            s_key varchar(32) NOT NULL COMMENT '设置的key',
            s_val int(11) NOT NULL DEFAULT '0' COMMENT '设置的val',
            s_id int(11) NOT NULL DEFAULT '0' COMMENT '区服ID',
            start_time int(11) NOT NULL DEFAULT '0',
            end_time int(11) NOT NULL DEFAULT '0',
            detail varchar(256) NOT NULL DEFAULT '',
            s_time int(11) NOT NULL DEFAULT '0' COMMENT '更新的时间',
            PRIMARY KEY (id),
            UNIQUE KEY SID_KEY (s_id,s_key),
            KEY s_key (s_key)
          ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
