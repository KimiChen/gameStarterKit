import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_adjust_prompt_1784332800000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE adjust_prompt (
          id bigint(20) NOT NULL AUTO_INCREMENT,
          type varchar(16) NOT NULL COMMENT 'Prompt category',
          name varchar(64) NOT NULL COMMENT 'Prompt file name',
          value longtext NOT NULL COMMENT 'Prompt content',
          version int(11) NOT NULL DEFAULT 1 COMMENT 'Optimistic lock version',
          create_time int(11) NOT NULL COMMENT 'Create timestamp',
          update_time int(11) NOT NULL COMMENT 'Update timestamp',
          description text NOT NULL COMMENT 'Prompt description',
          created_by varchar(64) NOT NULL DEFAULT '' COMMENT 'Create operator',
          updated_by varchar(64) NOT NULL DEFAULT '' COMMENT 'Last update operator',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_prompt_type_name (type, name),
          KEY idx_adjust_prompt_type_update (type, update_time, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS adjust_prompt')
    }
}
