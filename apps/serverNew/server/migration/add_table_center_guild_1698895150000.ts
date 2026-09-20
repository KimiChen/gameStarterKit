import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_center_guild_1698895150000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(` 
            CREATE TABLE center_guild (
                guild_id int(11) NOT NULL AUTO_INCREMENT COMMENT '帮会ID',
                sid int(11) NOT NULL DEFAULT '0' COMMENT '区服ID',
                user_id bigint(20) NOT NULL DEFAULT '0' COMMENT '帮主玩家ID',
                guild_name varchar(50) NOT NULL DEFAULT '' COMMENT '帮会名称',
                guild_create_time int(11) NOT NULL DEFAULT '0' COMMENT '帮会创建时间',
                PRIMARY KEY (guild_id),
                KEY user_id (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
