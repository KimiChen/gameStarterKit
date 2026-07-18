-- game 服务端 MySQL 8.0 全量 DDL（来源：docs/SERVER.md §8 outbox / §13 契约表）
-- 幂等：全部 CREATE TABLE IF NOT EXISTS + 预置行 ODKU no-op，可重复执行。
-- 前置：MySQL ≥ 8.0.19，binlog_format=ROW，sql_mode 含 STRICT_TRANS_TABLES。
-- ⏸ rank_award / rank_snapshot 依赖 rating 算法拍板（M0），拍板后补充。

-- 账号（token_epoch 是撤销的持久真相；封号先写 MySQL 再删 Redis session）
CREATE TABLE IF NOT EXISTS accounts (
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  openid        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  unionid       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  status        TINYINT UNSIGNED NOT NULL DEFAULT 0,      -- 0 正常 / 1 封禁 / 2 注销
  token_epoch   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_openid  (openid),
  UNIQUE KEY uk_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 货币余额【权威】。复合 PK 走主键等值锁；CHECK 只是兜底，SQL 内必须 WHERE balance >= ?
CREATE TABLE IF NOT EXISTS user_currency (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency   SMALLINT UNSIGNED NOT NULL,
  balance    BIGINT NOT NULL DEFAULT 0,
  version    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_fence BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, currency),
  CONSTRAINT chk_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 货币流水 + 幂等键。幂等必须 UNIQUE(user_id, idem_key)，⛔ 不是全局 UNIQUE(idem_key)（09·I4）
CREATE TABLE IF NOT EXISTS currency_ledger (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency      SMALLINT UNSIGNED NOT NULL,
  delta         BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  idem_key      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason        VARCHAR(64) NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_idem (user_id, idem_key),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 跨存储 intent（04）。status TINYINT：0 pending / 1 done / 2 dead，⛔ 全代码数字常量（09·X4）
CREATE TABLE IF NOT EXISTS gameplay_outbox (
  op_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id     VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  effect      JSON NOT NULL,
  status      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(255) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (op_id),
  KEY idx_pending (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 单例任务领导权 + fencing。⛔ 别用 GET_LOCK（连接作用域，连接池下泄漏）（09·X7）
CREATE TABLE IF NOT EXISTS singleton_lease (
  lease_name   VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  holder       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fence_token  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (lease_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 微信支付订单状态机。status：0 created / 1 paid / 2 delivered / 3 refunded / 4 closed
CREATE TABLE IF NOT EXISTS purchases (
  order_id      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sku           VARCHAR(64) NOT NULL,
  amount_fen    INT UNSIGNED NOT NULL,
  status        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  wx_txn_id     VARCHAR(64) NULL,
  deliver_op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_id),
  UNIQUE KEY uk_wx_txn (wx_txn_id),
  KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- match_id 幂等闸：非分区表，match_id 单独唯一（05·Δ2）
CREATE TABLE IF NOT EXISTS match_index (
  match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (match_id)
) ENGINE=InnoDB;

-- 对局证据链：分区表，PK 必须含分区列（月度 REORGANIZE 滚动，见 06）
CREATE TABLE IF NOT EXISTS match_results (
  match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  mode       TINYINT UNSIGNED NOT NULL,
  payload    JSON NOT NULL,
  PRIMARY KEY (match_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS (created_at) (
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

-- 必达邮件【权威】：read_at / claimed_at 是唯一权威，Redis Stream 只作唤醒（09·A6）
CREATE TABLE IF NOT EXISTS mail (
  mail_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title        VARCHAR(128) NOT NULL,
  body         VARCHAR(1024) NOT NULL,
  attach_op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  attach_effect JSON NULL,               -- 附件 Effect（M6 增列，05 待补；领取时以此插 outbox）
  read_at      DATETIME(3) NULL,
  claimed_at   DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (mail_id),
  KEY idx_user_unread (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 登录/撤销审计。revoke / ban 同步写，普通 login 可批量
CREATE TABLE IF NOT EXISTS login_audit (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event      VARCHAR(24) NOT NULL,     -- wx_login | refresh | logout | revoke | ban | fail
  reason     VARCHAR(64) NULL,
  ip         VARBINARY(16) NULL,       -- INET6_ATON()
  device_id  VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 单调发号（仅 user_id）。⚠ 行必须预置，否则首次采番错值（05）
CREATE TABLE IF NOT EXISTS seq (
  name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  val  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB;

-- 冷档：冷用户整档的权威。⚠ PRIMARY KEY (user_id) 是正确性要求，⛔ 禁按时间列 RANGE 分区（09·DB4）
CREATE TABLE IF NOT EXISTS user_archive (
  user_id        VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot       JSON NOT NULL,              -- user 全字段 + bag 各分片 + applied 成员集合
  schema_version SMALLINT UNSIGNED NOT NULL,
  fence_hwm      BIGINT UNSIGNED NOT NULL,   -- 权威判定与 thaw 恢复都靠它（09·F1）
  frozen_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY idx_frozen (frozen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  ROW_FORMAT=COMPRESSED;

-- 只读导出镜像（BI/GM）。⚠ 非权威、不回写、不参与恢复（09·A5）
CREATE TABLE IF NOT EXISTS user_snapshot_readonly (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot   JSON NOT NULL,
  ver        BIGINT UNSIGNED NOT NULL,
  synced_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 预置行（幂等 ODKU no-op，⛔ 绝不 INSERT IGNORE，09·DB1） ──

INSERT INTO seq (name, val) VALUES ('user_id', 0)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO singleton_lease (lease_name, holder, fence_token, expires_at) VALUES
  ('outbox_relayer',  '', 0, NOW(3)),
  ('freeze_worker',   '', 0, NOW(3)),
  ('season_rotation', '', 0, NOW(3))
ON DUPLICATE KEY UPDATE lease_name = lease_name;
