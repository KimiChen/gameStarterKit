-- game 服务端 MySQL 8.0 全量 DDL（来源：docs/SERVER.md §8 outbox / §13 契约表）
-- 幂等：全部 CREATE TABLE IF NOT EXISTS + 预置行 ODKU no-op，可重复执行。
-- 前置：MySQL ≥ 8.0.19，binlog_format=ROW，sql_mode 含 STRICT_TRANS_TABLES。

-- 货币余额【权威】。复合 PK 走主键等值锁；CHECK 只是兜底，SQL 内必须 WHERE balance >= ?
-- 每区独立经济（docs/DUAL_MODE.md §3.3）：server_id 进 PK；⚠ 写路径谓词必须带 server_id。
CREATE TABLE IF NOT EXISTS user_currency (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id  SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- 0=大混服/单形态；区服取 1..N
  currency   SMALLINT UNSIGNED NOT NULL,
  balance    BIGINT NOT NULL DEFAULT 0,
  version    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_fence BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, server_id, currency),
  CONSTRAINT chk_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 货币流水 + 幂等键。幂等必须 UNIQUE(user_id, server_id, idem_key)，⛔ 不是全局 UNIQUE(idem_key)（09·I4）
-- 每区独立经济（§3.2/§3.4）：op_id 已编码 sId（deriveOpId），server_id 进唯一键让跨区同 idem_key 并存。
CREATE TABLE IF NOT EXISTS currency_ledger (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  currency      SMALLINT UNSIGNED NOT NULL,
  delta         BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  idem_key      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason        VARCHAR(64) NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_idem (user_id, server_id, idem_key),
  KEY idx_user_time (user_id, server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 跨存储 intent（04）。status TINYINT：0 pending / 1 done / 2 dead，⛔ 全代码数字常量（09·X4）
-- 每区独立经济（§3.2/§3.6）：op_id 仍全局 PK（编码 sId 已全局唯一，刻意不分区，D3）；
-- server_id 补列供后台 worker（relayer/replayDead）重建区上下文 + apply 到对区 Redis 前缀。
CREATE TABLE IF NOT EXISTS gameplay_outbox (
  op_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id     VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  effect      JSON NOT NULL,
  status      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(255) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (op_id),
  KEY idx_pending (status, created_at),
  KEY idx_pending_srv (status, server_id, created_at)
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
-- 每区独立经济（§3.2/§3.7）：server_id 记充值落哪个区钱包；回调 handleWxPayNotify 据它重建区上下文。
CREATE TABLE IF NOT EXISTS purchases (
  order_id      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  sku           VARCHAR(64) NOT NULL,
  amount_fen    INT UNSIGNED NOT NULL,
  status        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  wx_txn_id     VARCHAR(64) NULL,
  deliver_op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_id),
  UNIQUE KEY uk_wx_txn (wx_txn_id),
  KEY idx_user (user_id, server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- match_id 幂等闸：非分区表，match_id 单独唯一（05·Δ2）
-- ⚠ **刻意不加 server_id**：本表是**全局**去重闸，matchId 本身全局唯一、与区无关。
-- 关单区 `DELETE FROM match_results WHERE server_id=N` 后这里会留下孤行——**那是对的**：
-- 去重必须是永久且全局的，否则同一 matchId 被重放时会重复落库。⛔ 别"顺手"给它加区。
CREATE TABLE IF NOT EXISTS match_index (
  match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (match_id)
) ENGINE=InnoDB;

-- 对局证据链：分区表，PK 必须含分区列（月度 REORGANIZE 滚动，见 06）
CREATE TABLE IF NOT EXISTS match_results (
  match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  -- 本局所属区（0 = 大混服）。⚠ **只作普通列 + 索引，⛔ 绝不进 PK**：本表按 created_at RANGE 分区，
  -- 分区表 PK 必须含分区列，往 PK 里塞 server_id 会改变分区语义与既有 REORGANIZE 流程（06/09·DB4）。
  -- 用途：运营按区统计、关单区时 `DELETE WHERE server_id = N` 回收（同其余经济表，U4 定案）。
  server_id  INT UNSIGNED NOT NULL DEFAULT 0,
  mode       TINYINT UNSIGNED NOT NULL,
  -- payload 的形状版本：0 = 未知/legacy（任意 JSON，顶层列不保证与 payload 一致）、
  -- 2 = 冻结的 v2（8 键）、3 = 可重放的 v3（16 键）。⚠ 读取方必须先看这一列再决定怎么解 payload：
  -- 直接拿 v3 verifier 去读 v2/legacy 行会在 exactRecord 抛 KEYS。DEFAULT 0 使存量行自动收敛成
  -- 「未知」，⛔ 不要给它别的默认值——把没标注过的历史行当成 v3 比不解读更危险。
  schema_version TINYINT UNSIGNED NOT NULL DEFAULT 0,
  payload    JSON NOT NULL,
  PRIMARY KEY (match_id, created_at),
  KEY idx_zone_time (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS (created_at) (
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

-- 必达邮件【权威】：read_at / claimed_at 是唯一权威，Redis Stream 只作唤醒（09·A6）
-- 每区独立经济（§3.2）：server_id 隔离各区邮箱（PK 仍 mail_id 自增，server_id 进收件箱索引）。
CREATE TABLE IF NOT EXISTS mail (
  mail_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  title        VARCHAR(128) NOT NULL,
  body         VARCHAR(1024) NOT NULL,
  attach_op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  attach_effect JSON NULL,               -- 附件 Effect（M6 增列，05 待补；领取时以此插 outbox）
  read_at      DATETIME(3) NULL,
  claimed_at   DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (mail_id),
  KEY idx_user_unread (user_id, server_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 冷档：每区冷用户整档的权威。⛔ 禁按时间列 RANGE 分区（09·DB4）
CREATE TABLE IF NOT EXISTS user_archive (
  user_id        VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  snapshot       JSON NOT NULL,              -- user 全字段 + bag 各分片 + applied 成员集合
  schema_version SMALLINT UNSIGNED NOT NULL,
  fence_hwm      BIGINT UNSIGNED NOT NULL,   -- thaw 后僵尸写 fence；不参与 live/archive 权威排序
  freeze_id      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  archive_phase  TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 0=LEGACY, 1=PREPARED, 2=COMMITTED
  frozen_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, server_id),
  UNIQUE KEY uk_archive_freeze_id (freeze_id),
  KEY idx_frozen (server_id, frozen_at, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  ROW_FORMAT=COMPRESSED;

-- 冷档每区容量 ledger：派生 admission 状态，authority 仍只有 user_archive。
CREATE TABLE IF NOT EXISTS archive_zone_usage (
  server_id  SMALLINT UNSIGNED NOT NULL,
  row_count  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  byte_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 只读导出镜像（BI/GM）。⚠ 非权威、不回写、不参与恢复（09·A5）
CREATE TABLE IF NOT EXISTS user_snapshot_readonly (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  snapshot   JSON NOT NULL,
  ver        BIGINT UNSIGNED NOT NULL,
  synced_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 预置行（幂等 ODKU no-op，⛔ 绝不 INSERT IGNORE，09·DB1） ──

INSERT INTO singleton_lease (lease_name, holder, fence_token, expires_at) VALUES
  ('outbox_relayer',  '', 0, NOW(3)),
  ('freeze_worker',   '', 0, NOW(3))
ON DUPLICATE KEY UPDATE lease_name = lease_name;
