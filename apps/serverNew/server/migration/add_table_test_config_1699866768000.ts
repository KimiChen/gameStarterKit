import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_test_config_1699866768000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE test_config (
            id int(11) NOT NULL AUTO_INCREMENT,
            config_name varchar(100) NOT NULL DEFAULT '' COMMENT '配置名称',
            config_content longtext NOT NULL COMMENT '配置内容',
            server_id int(11) NOT NULL DEFAULT '0' COMMENT '区服id',
            salt varchar(32) NOT NULL DEFAULT '' COMMENT '盐',
            create_ts int(11) NOT NULL DEFAULT '0' COMMENT '导入时间',
            update_ts int(11) NOT NULL DEFAULT '0' COMMENT '更新时间',
            lua_content blob NOT NULL COMMENT 'lua配置文件',
            can_start int(11) NOT NULL DEFAULT '0' COMMENT '配置表是否可启动',
            json_content longtext NOT NULL COMMENT 'json配置',
            available int(11) NOT NULL DEFAULT '0' COMMENT '配置表是否可用',
            php_file_path varchar(255) NOT NULL DEFAULT '' COMMENT '归档php配置路径',
            lua_file_path varchar(255) NOT NULL DEFAULT '' COMMENT '归档lua配置路径',
            json_file_path varchar(255) NOT NULL DEFAULT '' COMMENT '归档json配置路径',
            PRIMARY KEY (id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
