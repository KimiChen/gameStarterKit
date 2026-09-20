import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_adjust_wstool_user_1784073600000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE adjust_wstool_user (
          id int(11) NOT NULL AUTO_INCREMENT,
          name varchar(64) NOT NULL COMMENT 'SSO account name',
          chinese_name varchar(64) NOT NULL COMMENT 'Display name',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_wstool_user_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS adjust_wstool_user')
    }
}
