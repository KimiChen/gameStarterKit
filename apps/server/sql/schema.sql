-- game 服务端 MySQL 8.0 全量 DDL（来源：docs/SERVER.md §8 outbox / §13 契约表）
-- 幂等：全部 CREATE TABLE IF NOT EXISTS + 预置行 ODKU no-op，可重复执行。
-- 前置：MySQL ≥ 8.0.19，binlog_format=ROW，sql_mode 含 STRICT_TRANS_TABLES。

-- 账号。⚠ **token 已不在本表**（M12e）：单端语义的作用域从「账号」收窄到「(账号, 区)」，
-- 会话权威搬到 `account_sessions`（每区一行）。本表只留**账号级**真相：`status`（1=封禁，登录/校验即拒）
-- 与画像/微信凭据。封号仍是**账号级**「下次登不上」= `status=1` + 清掉**全部区**的会话行。
-- ⛔ 别再往本表加 token 列：两个真相位会让"哪个才算数"变成运行期问题。
CREATE TABLE IF NOT EXISTS accounts (
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  openid        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  unionid       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  status        TINYINT UNSIGNED NOT NULL DEFAULT 0,      -- 0 正常 / 1 封禁 / 2 注销
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  session_key        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,  -- 微信 session_key（⛔ 服务端持有 G8；手机号解密）
  nickname           VARCHAR(64) NULL,                                        -- ↓ 推迟授权补画像（§2.7），开局 NULL
  avatar_url         VARCHAR(256) NULL,
  phone              VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_openid  (openid),
  UNIQUE KEY uk_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 会话权威（M12e）：**每 (账号, 区) 一行**。单端语义的作用域 = `(user_id, server_id)` ——
-- 同一个区内第二次登录顶掉前一个；**不同区互不影响**（玩家可在 1 区与 107 区各有一个在线角色）。
-- ⚠ 这样定的直接后果：某个区的全部会话必然落在**承载该区的那一个物理组**内（每组 GROUP_ZONES 固定、
-- 区的经济/冷档分区也在该组库）⇒ 顶号的踢人**永远不需要跨组送达**（原待办 A3 因此消解，⛔ 不是"修好了"）。
-- ⚠ 封号仍是账号级：`accounts.status=1` + 删本表该 uid 的**全部**行 ⇒ 各区在线连接仍需 GM 逐节点踢（09·G7b）。
CREATE TABLE IF NOT EXISTS account_sessions (
  user_id         VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id       INT UNSIGNED NOT NULL,                                       -- 0 = 大混服/单形态
  token_hash      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- 该区当前有效 token 的 sha256
  token_issued_at DATETIME(3) NOT NULL,                                        -- 签发时刻：过期判定 + 组缓存写入栅栏（A1）
  PRIMARY KEY (user_id, server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 角色/足迹注册表（DUAL_MODE §2.5/§2.6，M12）：「uid 在哪些区建过角」的 durable 权威。
-- 建角(首进区)时写、⚠ **先于** Redis 档（保证「有档⇒有 char 行」，无 false-negative 丢档）；
-- 喂 F4「本区建过角没」判据(M12b) + ul「我的区」。⚠ 账号服务抽出后(M12c)迁至其库、handle 换不透明句柄。
-- （character/role 是 MySQL 保留字，故名 char_registry。）
CREATE TABLE IF NOT EXISTS char_registry (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id  SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 货币余额【权威】。复合 PK 走主键等值锁；CHECK 只是兜底，SQL 内必须 WHERE balance >= ?
-- 每区独立经济（docs/DUAL_MODE.md §3.2）：server_id 进 PK；⚠ 写路径谓词必须带 server_id（§3.3 B1，M13 代码步补）。
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

-- 登录/撤销审计。revoke / ban 同步写，普通 login 可批量
CREATE TABLE IF NOT EXISTS login_audit (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event      VARCHAR(24) NOT NULL,     -- wx_login | refresh | logout | revoke | ban | fail
  -- ⚠ 曾是 VARCHAR(64)：ban/revoke 的 reason 来自**运营输入**、login_diverged 的 reason 含错误原文，
  -- 超长在 STRICT_TRANS_TABLES 下抛 ER_DATA_TOO_LONG(1406) 而非截断 ⇒ 审计整行丢失，
  -- 且 banUser 末尾那句 auditLogin 无 catch ⇒ 权威已写、人已踢，接口却报失败。
  -- 加宽 + 写入侧集中钳制（两处 auditLogin）双保险：split 下账号库没跑过本 DDL 时靠钳制兜底。
  reason     VARCHAR(255) NULL,
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
  ('freeze_worker',   '', 0, NOW(3))
ON DUPLICATE KEY UPDATE lease_name = lease_name;
