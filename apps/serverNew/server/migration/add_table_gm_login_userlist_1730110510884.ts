import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_gm_login_userlist_1730110510884 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        CREATE TABLE gm_login_user_list (
          id int(11) NOT NULL AUTO_INCREMENT,
          open_id varchar(64) NOT NULL COMMENT '账号id',
          login_secret varchar(128) NOT NULL COMMENT '账号登录密码，加密后',
          login_salt varchar(16) NOT NULL COMMENT '密码的盐值',
          create_time int(11) NOT NULL COMMENT '密码创建时间,判断密码有效期',
          PRIMARY KEY (id),
          UNIQUE KEY open_id (open_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
