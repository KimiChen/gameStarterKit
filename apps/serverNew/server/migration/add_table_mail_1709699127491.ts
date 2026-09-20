import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_mail_1709699127491 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE mail (
              m_id int NOT NULL AUTO_INCREMENT,
              user_id bigint NOT NULL DEFAULT '0',
              m_type int NOT NULL DEFAULT '0' COMMENT '信件类型>100读配置',
              m_from varchar(28) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '来自那里',
              m_from_name varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '来自谁',
              m_from_cid int NOT NULL DEFAULT '0' COMMENT '好友头像id',
              m_title text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '标题',
              m_content text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '内容',
              m_award varchar(4096) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '奖励',
              m_award_show varchar(4096) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '只是用于展示奖励用，不能领取',
              m_is_award tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否领取1是0否',
              m_is_read tinyint NOT NULL DEFAULT '0' COMMENT '是否阅读',
              m_dateline int NOT NULL DEFAULT '0' COMMENT '时间',
              m_award_time int NOT NULL DEFAULT '0' COMMENT '领奖时间',
              m_params text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '参数',
              m_past_time int NOT NULL DEFAULT '0' COMMENT '邮件过期时间',
              uqid int NOT NULL DEFAULT '0' COMMENT '对应后台的邮件id',
              m_more_status int NOT NULL DEFAULT '0' COMMENT '1屏蔽3删除',
              PRIMARY KEY (m_id),
              KEY user_id_dateline (user_id,m_dateline),
              KEY uqid (uqid),
              KEY m_past_time_index (m_past_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
            `)
        await queryRunner.query(`
            CREATE TABLE mail_role_log (
              id int NOT NULL AUTO_INCREMENT,
              uqid int NOT NULL COMMENT '平台的唯一id',
              user_id bigint NOT NULL COMMENT '对应的用户id',
              log_time int NOT NULL COMMENT '入库的时间',
              action_time int NOT NULL COMMENT '执行的时间',
              action_status int NOT NULL COMMENT '0未执行 1 成功 2 执行失败',
              fail_msg varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '失败的原因',
              action_type int NOT NULL COMMENT '类型',
              awards text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '奖励',
              PRIMARY KEY (id),
              UNIQUE KEY uqid (uqid,user_id),
              KEY user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
            `)
        await queryRunner.query(`
            CREATE TABLE global_mail (
              id int NOT NULL AUTO_INCREMENT,
              type int NOT NULL DEFAULT '0' COMMENT '1全服邮件2玩家邮件3范围邮件4群发邮件5渠道邮件',
              uqid int NOT NULL DEFAULT '0' COMMENT '邮件的唯一id',
              title text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '邮件标题',
              content text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '邮件内容',
              awards varchar(4096) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '奖励',
              past_time int NOT NULL DEFAULT '0' COMMENT '邮件结束时间',
              server_id text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '区服ids',
              role_id text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '哪些角色id不发',
              update_time int NOT NULL DEFAULT '0' COMMENT '更新时间',
              init_time_type int NOT NULL DEFAULT '0' COMMENT '2之前发送前的玩家可以领取',
              mail_range text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '范围邮件的条件',
              more_status int NOT NULL DEFAULT '0' COMMENT '屏蔽等状态',
              PRIMARY KEY (id),
              UNIQUE KEY uqid (uqid),
              KEY past_time (past_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
            `)
        await queryRunner.query(`
        CREATE TABLE global_mail_timing (
            id int NOT NULL AUTO_INCREMENT,
            type int NOT NULL COMMENT '1全服邮件2玩家邮件3范围邮件4群发邮件5渠道邮件',
            uqid int NOT NULL COMMENT '邮件的唯一id',
            title text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '邮件标题',
            content text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '邮件内容',
            awards mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '奖励',
            past_time int NOT NULL COMMENT '邮件结束时间',
            server_id text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '区服ids',
            role_id text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '哪些角色id不发',
            update_time int NOT NULL COMMENT '更新时间',
            timing_time int NOT NULL DEFAULT '0' COMMENT '定时时间',
            init_time_type int NOT NULL COMMENT '2发送时间之前的玩家可以领',
            mail_status tinyint NOT NULL DEFAULT '0' COMMENT '邮件的状态',
            total_num int NOT NULL DEFAULT '0' COMMENT '总发送次数',
            suc_num int NOT NULL DEFAULT '0' COMMENT '成功的次数',
            add_type int NOT NULL DEFAULT '0' COMMENT '无痕操作的类型1 发放奖励 2 扣除奖励（只到0） 3 扣除奖励 （可负数）',
            mail_range text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '范围邮件的条件',
            mail_more_status int NOT NULL DEFAULT '0' COMMENT '发送成功后续的状态',
            mail_more_confirm int NOT NULL DEFAULT '0' COMMENT '状态进行中的标识',
            mail_more_info text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '状态操作的详情',
            PRIMARY KEY (id),
            UNIQUE KEY uqid (uqid),
            KEY timing_time (timing_time)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
