import { MigrationInterface, QueryRunner } from '@arthropoda/typeorm'

export class init_1695636761000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS center_user (
              id int(11) NOT NULL AUTO_INCREMENT,
              open_id varchar(64) NOT NULL COMMENT '小游戏的openid',
              user_spid varchar(50) NOT NULL DEFAULT '' COMMENT '用户的渠道id',
              user_init_time int(11) NOT NULL DEFAULT '0' COMMENT '第一次注册的时间',
              user_money int(11) NOT NULL DEFAULT '0' COMMENT '充值的最大金额',
              user_id bigint(20) NOT NULL DEFAULT '0' COMMENT '第一个用户的id',
              user_platform int(11) NOT NULL DEFAULT '0' COMMENT '1 是安卓 2是ios',
              device_id varchar(64) NOT NULL DEFAULT '' COMMENT '设备id',
              device_type tinyint(4) NOT NULL DEFAULT '0' COMMENT '设备类型设备系统:1安卓 2ios 3windowphone',
              is_certificate int(11) NOT NULL COMMENT '是否实名认证',
              PRIMARY KEY (id),
              UNIQUE KEY open_id (open_id),
              KEY user_id (user_id),
              KEY device_id (device_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
        )

        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS device_white(
                id int(11) NOT NULL AUTO_INCREMENT,
                device_id varchar(64) NOT NULL,
                PRIMARY KEY(id),
                UNIQUE KEY device_id(device_id)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;`)
        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS ops_user(
                id int(11) NOT NULL AUTO_INCREMENT,
                open_id varchar(64) NOT NULL DEFAULT '0' COMMENT '小游戏的openid',
                ops_type int(11) NOT NULL DEFAULT '0' COMMENT '运营账号类型',
                create_time int(11) NOT NULL DEFAULT '0' COMMENT '创建时间',
                status int(11) NOT NULL DEFAULT '0' COMMENT '启用状态',
                remark varchar(255) NOT NULL DEFAULT '' COMMENT '备注',
                PRIMARY KEY(id),
                UNIQUE KEY open_id(open_id)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;`)
        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS server_list(
                s_id int(11) NOT NULL COMMENT '服的id',
                s_name varchar(64) NOT NULL DEFAULT '' COMMENT '服名称',
                s_time datetime NOT NULL COMMENT '开服的时间',
                s_state int(11) NOT NULL DEFAULT '0' COMMENT '1 推荐 2火爆',
                s_port int(11) NOT NULL DEFAULT '0' COMMENT '长连接port',
                s_host tinyint(4) NOT NULL DEFAULT '0' COMMENT '用的host',
                s_maintain_start int(11) NOT NULL DEFAULT '0' COMMENT '维护开始时间',
                s_maintain_end int(11) NOT NULL DEFAULT '0' COMMENT '维护结束时间',
                s_interval_time int(11) NOT NULL DEFAULT '0' COMMENT '切换间隔时间',
                s_interval_start_time int(11) NOT NULL DEFAULT '0' COMMENT '开始设置的时间',
                s_recharge_resettime int(11) NOT NULL DEFAULT '0',
                PRIMARY KEY(s_id)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;`)

        await queryRunner.query(` 
        CREATE TABLE IF NOT EXISTS gonggao_game (
            id int(11) NOT NULL AUTO_INCREMENT,
            start_time int(11) NOT NULL,
            end_time int(11) NOT NULL,
            title varchar(256) NOT NULL,
            content text NOT NULL COMMENT '公告内容',
            sort_index int(11) NOT NULL COMMENT '排序',
            uqid int(11) NOT NULL COMMENT '版本号',
            all_platform int(11) NOT NULL COMMENT '是否全平台1:是0否',
            server_id text NOT NULL COMMENT '区服ids',
            is_jump int(11) NOT NULL COMMENT '是否跳转',
            jump_url varchar(1024) NOT NULL COMMENT '跳转地址',
            update_time int(11) NOT NULL COMMENT '更新的时间戳',
            is_close int(11) NOT NULL COMMENT '关闭状态',
            op_user_id int(11) NOT NULL COMMENT '平台操作人id',
            type tinyint(4) NOT NULL DEFAULT '1' COMMENT '公告类型',
            img varchar(200) NOT NULL DEFAULT '' COMMENT '公告图片',
            act_start_time int(11) NOT NULL DEFAULT '0' COMMENT '活动开始时间',
            act_end_time int(11) NOT NULL DEFAULT '0' COMMENT '活动结束时间',
            PRIMARY KEY (id),
            KEY start_time (start_time),
            KEY end_time (end_time),
            KEY uqid (uqid),
            KEY update_time (update_time),
            KEY op_user_id (op_user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)

        await queryRunner.query(` 
        CREATE TABLE IF NOT EXISTS gonggao_login (
            id int(11) NOT NULL AUTO_INCREMENT,
            start_time int(11) NOT NULL,
            end_time int(11) NOT NULL,
            title varchar(256) NOT NULL,
            content text NOT NULL,
            uqid int(11) NOT NULL COMMENT '版本号',
            update_time int(11) NOT NULL COMMENT '更新的时间戳',
            is_close int(11) NOT NULL COMMENT '关闭状态',
            op_user_id int(11) NOT NULL COMMENT '平台操作人id',
            sort int(10) UNSIGNED NOT NULL DEFAULT '0',
            type smallint(5) UNSIGNED NOT NULL DEFAULT '0',
            img varchar(255) NOT NULL DEFAULT '',
            PRIMARY KEY (id),
            KEY start_time (start_time),
            KEY end_time (end_time),
            KEY uqid (uqid),
            KEY update_time (update_time),
            KEY op_user_id (op_user_id),
            KEY sort (sort)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)

        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS server_user (
                user_id bigint(20) NOT NULL,
                user_reg_id varchar(50) NOT NULL DEFAULT '' COMMENT '用户注册时候的平台id  (id__platformFlag__serverId)',
                user_name varchar(50) NOT NULL DEFAULT '' COMMENT ' 用户名字',
                user_pic varchar(180) NOT NULL DEFAULT '',
                user_nick_name varchar(50) NOT NULL DEFAULT '',
                user_init_time int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户第一次开始玩的时间',
                user_login_date int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '登陆日期',
                user_login_days int(11) NOT NULL DEFAULT '0' COMMENT '登陆天数',
                user_activity_time int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '最后活跃时间',
                user_sid smallint(5) UNSIGNED NOT NULL DEFAULT '0' COMMENT '服务器id',
                user_gc bigint(20) UNSIGNED NOT NULL DEFAULT '0' COMMENT '元宝',
                user_vip_exp decimal(11,2) NOT NULL DEFAULT '0.00' COMMENT '充值的钱数',
                user_vip int(11) NOT NULL DEFAULT '0' COMMENT 'vip等级',
                user_money int(11) NOT NULL DEFAULT '0' COMMENT '充值的金额',
                user_init_role int(11) NOT NULL DEFAULT '0' COMMENT '是否初始化了角色',
                user_level int(11) NOT NULL DEFAULT '0' COMMENT '人物等级',
                user_fp bigint(20) NOT NULL DEFAULT '0' COMMENT '总战力',
                user_group tinyint(4) NOT NULL DEFAULT '0' COMMENT '门派',
                user_ios int(11) NOT NULL DEFAULT '0' COMMENT '小游戏是否为ios',
                user_ip varchar(32) NOT NULL DEFAULT '' COMMENT '用户的id',
                user_reg_ip varchar(32) NOT NULL DEFAULT '' COMMENT '注册IP',
                user_reg_device_id varchar(64) NOT NULL DEFAULT '' COMMENT '注册设备',
                user_reg_device_type tinyint(4) NOT NULL DEFAULT '0' COMMENT '注册设备类型',
                client_ver varchar(10) NOT NULL DEFAULT '' COMMENT '客户端版本号',
                user_sc bigint(20) UNSIGNED NOT NULL DEFAULT '0' COMMENT '灵石（游戏货币）',
                lately_recharge_time int(11) NOT NULL DEFAULT '0' COMMENT '最后充值时间',
                PRIMARY KEY (user_id),
                UNIQUE KEY user_reg_id (user_reg_id,user_sid),
                KEY user_init_time (user_init_time),
                KEY user_activity_time (user_activity_time),
                KEY user_vip_exp (user_vip_exp),
                KEY user_reg_device_id (user_reg_device_id),
                KEY user_sc (user_sc),
                KEY user_gc (user_gc),
                KEY user_fp (user_fp),
                KEY user_name (user_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)

        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS game_package (
                id int(11) NOT NULL AUTO_INCREMENT,
                platform varchar(32) NOT NULL COMMENT '平台标识',
                channel_id varchar(32) NOT NULL COMMENT '渠道ID',
                channel_child_id varchar(32) NOT NULL COMMENT '渠道子ID',
                package_ver varchar(32) NOT NULL COMMENT '当前包版本',
                package_ver_update varchar(32) NOT NULL COMMENT '当前包更新版本',
                package_force_update tinyint(1) NOT NULL DEFAULT '0' COMMENT '包是否强制更新',
                package_update_addr varchar(128) NOT NULL COMMENT '包强更地址',
                package_res_ver varchar(32) NOT NULL COMMENT '包资源版本',
                package_force_res_ver varchar(32) NOT NULL COMMENT '包强制资源版本',
                update_before_login tinyint(1) NOT NULL DEFAULT '0' COMMENT '登录前更新',
                update_restart tinyint(1) NOT NULL DEFAULT '0' COMMENT '更新后是否重启',
                PRIMARY KEY (id),
                UNIQUE KEY p_c_c_pv (platform,channel_id,channel_child_id,package_ver)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)

        await queryRunner.query(` 
            CREATE TABLE IF NOT EXISTS gm_config (
                id int(11) NOT NULL AUTO_INCREMENT,
                module varchar(64) NOT NULL DEFAULT '' COMMENT '模块的key',
                config_content varchar(2048) NOT NULL DEFAULT '' COMMENT '模块的配置详情:json格式',
                update_time int(11) NOT NULL DEFAULT '0' COMMENT '配置上次更新的时间',
                PRIMARY KEY (id),
                UNIQUE KEY module (module)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; `)
    }
    async down(queryRunner: QueryRunner): Promise<void> {}
}
