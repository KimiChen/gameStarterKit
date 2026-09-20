import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_adjust_func_case_1784160000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE adjust_func_case (
          id int(11) NOT NULL AUTO_INCREMENT,
          name varchar(64) NOT NULL COMMENT 'Case or group name',
          type tinyint(4) NOT NULL DEFAULT 0 COMMENT '0 group, 1 case',
          parent_id bigint(20) NOT NULL DEFAULT 0 COMMENT 'Parent group id',
          user json NOT NULL COMMENT 'Batch account configuration',
          func json NOT NULL COMMENT 'Custom function steps',
          sort int(11) NOT NULL DEFAULT 0 COMMENT 'Sibling order',
          PRIMARY KEY (id),
          KEY idx_adjust_func_case_parent_sort (parent_id, sort, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS adjust_func_case')
    }
}
