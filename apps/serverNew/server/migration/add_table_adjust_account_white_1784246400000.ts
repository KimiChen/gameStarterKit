import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_adjust_account_white_1784246400000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE adjust_account_white (
          id int(11) NOT NULL AUTO_INCREMENT,
          account varchar(64) NOT NULL COMMENT 'Game account name',
          open_id varchar(64) NOT NULL DEFAULT '' COMMENT 'Resolved game openId',
          last_login_time int(11) NOT NULL DEFAULT 0 COMMENT 'Last login timestamp',
          add_time int(11) NOT NULL COMMENT 'Whitelist add timestamp',
          created_by varchar(64) NOT NULL DEFAULT '' COMMENT 'SSO operator name',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_account_white_account (account),
          KEY idx_adjust_account_white_add_time (add_time, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS adjust_account_white')
    }
}
