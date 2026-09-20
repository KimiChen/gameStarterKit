import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_tables_adjust_robot_suite_1784419200000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE adjust_case (
          id bigint NOT NULL AUTO_INCREMENT,
          name varchar(64) NOT NULL COMMENT 'Robot case or group name',
          parent_id bigint NOT NULL DEFAULT 0 COMMENT 'Parent group id',
          type tinyint NOT NULL DEFAULT 0 COMMENT '0 group, 1 func, 2 websocket, 3 task',
          router varchar(160) NOT NULL DEFAULT '' COMMENT 'Function or websocket route',
          content longtext NOT NULL COMMENT 'Case content',
          param longtext NOT NULL COMMENT 'Case variables as JSON',
          ext longtext NOT NULL COMMENT 'Compiled task cache',
          create_time int NOT NULL COMMENT 'Create timestamp',
          update_time int NOT NULL COMMENT 'Update timestamp',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_case_parent_name (parent_id, name),
          KEY idx_adjust_case_parent (parent_id),
          KEY idx_adjust_case_type (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)

        await queryRunner.query(`
        CREATE TABLE adjust_env (
          id bigint NOT NULL AUTO_INCREMENT,
          name varchar(64) NOT NULL COMMENT 'Environment variable name',
          type varchar(16) NOT NULL DEFAULT 'string' COMMENT 'Value type',
          default_value longtext NOT NULL COMMENT 'Default value',
          description text NOT NULL COMMENT 'Variable description',
          create_time int NOT NULL COMMENT 'Create timestamp',
          update_time int NOT NULL COMMENT 'Update timestamp',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_env_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)

        await queryRunner.query(`
        CREATE TABLE adjust_multiple_case (
          id bigint NOT NULL AUTO_INCREMENT,
          name varchar(64) NOT NULL COMMENT 'Batch plan name',
          data longtext NOT NULL COMMENT 'Batch users and tasks as JSON',
          description text NOT NULL COMMENT 'Batch plan description',
          create_time int NOT NULL COMMENT 'Create timestamp',
          update_time int NOT NULL COMMENT 'Update timestamp',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_multiple_case_name (name),
          KEY idx_adjust_multiple_case_update (update_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)

        await queryRunner.query(`
        CREATE TABLE adjust_user_group (
          id bigint NOT NULL AUTO_INCREMENT,
          name varchar(64) NOT NULL COMMENT 'Robot user group name',
          users longtext NOT NULL COMMENT 'Account or uid users as JSON',
          create_time int NOT NULL COMMENT 'Create timestamp',
          update_time int NOT NULL COMMENT 'Update timestamp',
          PRIMARY KEY (id),
          UNIQUE KEY uniq_adjust_user_group_name (name),
          KEY idx_adjust_user_group_update (update_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS adjust_user_group')
        await queryRunner.query('DROP TABLE IF EXISTS adjust_multiple_case')
        await queryRunner.query('DROP TABLE IF EXISTS adjust_env')
        await queryRunner.query('DROP TABLE IF EXISTS adjust_case')
    }
}
