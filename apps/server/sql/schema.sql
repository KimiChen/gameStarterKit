-- game 服务端 MySQL 8.0 全量 DDL（来源：docs/SERVER.md §8 outbox / §13 契约表）
-- 幂等：全部 CREATE TABLE IF NOT EXISTS + 预置行 ODKU no-op，可重复执行。
-- 前置：MySQL ≥ 8.0.19，binlog_format=ROW，sql_mode 含 STRICT_TRANS_TABLES。

-- 货币余额【权威】。复合 PK 走主键等值锁；CHECK 只是兜底，SQL 内必须 WHERE balance >= ?
-- 每区独立经济（docs/DUAL_MODE.md §3.3）：server_id 进 PK；⚠ 写路径谓词必须带 server_id。
-- 资产主体（MMO MF2，docs/MMO.md §3）：owner_kind 0 = account（存量全部）/ 1 = persona（owner_id = persona_id）进 PK；
-- 存量升级由 tools/db-bootstrap.ts ensureAssetOwnerShape 一次性完成（列缺省 0 / '' 让旧行无损并入）。
CREATE TABLE IF NOT EXISTS user_currency (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id  SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- 0=大混服/单形态；区服取 1..N
  owner_kind TINYINT UNSIGNED NOT NULL DEFAULT 0,    -- 0 account / 1 persona（shared protocol/identity.ts）
  owner_id   VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  currency   SMALLINT UNSIGNED NOT NULL,
  balance    BIGINT NOT NULL DEFAULT 0,
  version    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_fence BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, server_id, owner_kind, owner_id, currency),
  CONSTRAINT chk_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 货币流水 + 幂等键。幂等必须 UNIQUE(user_id, server_id, owner_kind, owner_id, idem_key)，⛔ 不是全局 UNIQUE(idem_key)（09·I4）
-- 每区独立经济（§3.2/§3.4）：op_id 已编码 sId（deriveOpId），server_id 进唯一键让跨区同 idem_key 并存。
-- 资产主体（MMO MF2）：owner_kind / owner_id 进唯一键，同 uid 下 account 与各 persona 的流水互不可见。
CREATE TABLE IF NOT EXISTS currency_ledger (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  owner_kind    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  owner_id      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  currency      SMALLINT UNSIGNED NOT NULL,
  delta         BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  idem_key      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason        VARCHAR(64) NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_idem (user_id, server_id, owner_kind, owner_id, idem_key),
  KEY idx_user_time (user_id, server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 跨存储 intent（04）。status TINYINT：0 pending / 1 done / 2 dead，⛔ 全代码数字常量（09·X4）
-- 每区独立经济（§3.2/§3.6）：op_id 仍全局 PK（编码 sId 已全局唯一，刻意不分区，D3）；
-- server_id 补列供后台 worker（relayer/replayDead）重建区上下文 + apply 到对区 Redis 前缀。
-- 资产主体（MMO MF2）：intent 带 owner_kind / owner_id（0 / '' = account 存量）；relayer 对 persona 主体只落账本、⛔ 不 apply 到账号 Redis 背包。
CREATE TABLE IF NOT EXISTS gameplay_outbox (
  op_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id     VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_id   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  owner_kind  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  owner_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
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

-- persona（MMO MF2，docs/MMO.md §3 / §5 MF2，per-zone）：账号在某 kit 下的角色级资产主体。框架只保证唯一（UNIQUE(server_id,
-- user_id, kit_id, slot)）与硬上限（PERSONA_MAX_SLOTS_HARD）；kit 的角色行经 persona_id 关联但 ⛔ 无外键（KIT.md §2）。
-- status TINYINT：0 active / 1 inactive；control_epoch 供 MF4 控制权 CAS；world_address NULL = 不在任何世界房；
-- session_generation 随会话撤销 / 踢下线抬高（MF2-B5：顶号按区、封号 / 撤销全部区）；meta 由 kit 的 createPersona 交来、框架不解释。
-- idx_persona_uid (user_id)：账号级撤销 `WHERE user_id = ?` 抬全部区会话代走索引（其余索引都以 server_id 前导，B2 形态的存量表由
-- db-bootstrap 的 ensureAssetOwnerShape 补建）。
CREATE TABLE IF NOT EXISTS persona (
  server_id          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  persona_id         VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id            VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kit_id             VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  slot               TINYINT UNSIGNED NOT NULL,
  status             TINYINT UNSIGNED NOT NULL DEFAULT 0,
  control_epoch      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  world_address      VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  session_generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
  meta               JSON NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, persona_id),
  UNIQUE KEY uk_persona_slot (server_id, user_id, kit_id, slot),
  KEY idx_persona_user (server_id, user_id, kit_id),
  KEY idx_persona_uid (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- world_instance（MMO MF4-B3，docs/MMO.md §4.4 / §5.4 MF4，per-zone）：分线（WorldAddress = sId + mapId + line）的权威登记行。
-- authority_epoch：权威租约代号（acquireAuthority CAS +1，单主不变量 §4.6-1）；holder：当前权威节点标识；state：WorldPhase 字符串；
-- checkpoint_rev：分线检查点修订（MF7b）；write_seq：MF7b `withWorldTx` 首句 CAS 用（v1.2 P1：建表就带上，避免二次迁移）。
-- ⛔ 无外键指向 kit 表（KIT.md §2）；实例 id 是随机 uuid，(server_id, map_id, line) 唯一。
CREATE TABLE IF NOT EXISTS world_instance (
  server_id       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  instance_id     VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  map_id          VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  line            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  authority_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
  holder          VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  state           VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'offline',
  checkpoint_rev  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  write_seq       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, instance_id),
  UNIQUE KEY uk_world_instance_line (server_id, map_id, line)
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

-- kit SQL 迁移账本（docs/KIT.md §5）：db:bootstrap 在 singleton_lease('db_bootstrap') 下按 kit id + 文件序只应用
-- 账本里没有的 `apps/kits/<id>/sql/NNN-<name>.sql`；已应用文件 sha256 变化即 fail-closed（⛔ 不改已发布迁移）。
-- 进度按语句粒度记（statement_count / applied_statements）：文件先入账再逐条执行，每条成功即推进；中途失败
-- （DDL 已隐式提交）下次 bootstrap 从失败那条续跑；applied_statements = statement_count 才算已应用。
-- ⚠ **刻意不加 server_id**：账本记录的是「哪个文件跑过」，全局一份，与区无关（tools/kit-migrations.ts）。
CREATE TABLE IF NOT EXISTS kit_migration (
  kit_id             VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  file               VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sha256             CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  statement_count    INT UNSIGNED NOT NULL DEFAULT 0,
  applied_statements INT UNSIGNED NOT NULL DEFAULT 0,
  applied_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (kit_id, file)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 预置行（幂等 ODKU no-op，⛔ 绝不 INSERT IGNORE，09·DB1） ──

INSERT INTO singleton_lease (lease_name, holder, fence_token, expires_at) VALUES
  ('outbox_relayer',  '', 0, NOW(3)),
  ('freeze_worker',   '', 0, NOW(3)),
  ('db_bootstrap',    '', 0, NOW(3))
ON DUPLICATE KEY UPDATE lease_name = lease_name;
