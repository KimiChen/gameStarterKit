import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class add_table_center_activity_1699866768000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(` 
        CREATE TABLE center_activity (
            id int(11) NOT NULL AUTO_INCREMENT,
            name varchar(32) NOT NULL DEFAULT '' COMMENT '活动关键字',
            type tinyint(4) NOT NULL DEFAULT '0' COMMENT '活动类型1服务启动导入2后台导入3后台导入不展示',
            open_ts int(11) NOT NULL DEFAULT '0' COMMENT '活动启动时间',
            close_ts int(11) NOT NULL DEFAULT '0' COMMENT '活动关闭时间',
            start_ts int(11) NOT NULL DEFAULT '0' COMMENT '活动开始时间',
            end_ts int(11) NOT NULL DEFAULT '0' COMMENT '活动结束时间',
            award_ts int(11) NOT NULL DEFAULT '0' COMMENT '活动开始领奖时间',
            salt varchar(32) NOT NULL DEFAULT '' COMMENT '活动MD5加密标识',
            status tinyint(4) NOT NULL DEFAULT '1' COMMENT '1正常2删除',
            activity_conf longtext NOT NULL COMMENT '活动配置',
            activity_detail longtext NOT NULL COMMENT '奖励的具体配置',
            plan_code varchar(32) NOT NULL DEFAULT '' COMMENT '后台活动导入标识码',
            del_status int(11) NOT NULL DEFAULT '0' COMMENT '删除的状态值，100是成功,其他值失败',
            server_id varchar(2048) NOT NULL DEFAULT '' COMMENT '跨服的区服',
            is_award tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否发奖',
            daily_start_time int(11) NOT NULL DEFAULT '0' COMMENT '活动每日开启时间',
            daily_end_time int(11) NOT NULL DEFAULT '0' COMMENT '活动每日结束时间',
            cross_server_id int(11) NOT NULL DEFAULT '0' COMMENT '跨服服务id',
            PRIMARY KEY (id),
            KEY name (name),
            KEY open_ts (open_ts),
            KEY close_ts (close_ts)
          ) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
