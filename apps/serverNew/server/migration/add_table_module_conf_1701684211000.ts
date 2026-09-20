import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_module_conf_1701684211000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE module_conf(
                id int(11) NOT NULL AUTO_INCREMENT,
                sid int(11) NOT NULL DEFAULT '0',
                name varchar(25) NOT NULL DEFAULT '',
                type tinyint(4) NOT NULL DEFAULT '0' COMMENT '功能类型',
                status tinyint(4) NOT NULL DEFAULT '1' COMMENT '1开启0关闭',
                c_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id),
                KEY s_id(sid)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;`)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
