-- SLG 阶段 1：只由 db:bootstrap 按 kit_migration 账本应用；发布后只追加迁移。
-- 每区的所有世界写入先锁本行，revision 分配与业务提交同事务，锁持有至 COMMIT。
-- tile_log / march_log 共用此序列，各日志单独读取可有缺号；普通 AUTO_INCREMENT 不替代提交顺序。
CREATE TABLE IF NOT EXISTS k_slg_revision (
  server_id SMALLINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 地块稀疏存储：缺行即默认无主格。唯一键插入冲突后在同一事务重读真实状态。
CREATE TABLE IF NOT EXISTS k_slg_tile (
  server_id SMALLINT UNSIGNED NOT NULL,
  tile_id INT UNSIGNED NOT NULL,
  owner_uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  guard_power INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, tile_id),
  KEY idx_owner (server_id, owner_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 请求回执绑定 uid、规范载荷摘要及契约版本；跨 RPC 缓存期仍原样重放响应。
CREATE TABLE IF NOT EXISTS k_slg_capture (
  server_id SMALLINT UNSIGNED NOT NULL,
  op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, op_id),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 地块变化与业务写、回执、奖励 intent 原子提交；tombstone 覆盖恢复默认/删除。
CREATE TABLE IF NOT EXISTS k_slg_tile_log (
  server_id SMALLINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  tile_id INT UNSIGNED NOT NULL,
  operation VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload JSON NOT NULL,
  tombstone TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, revision),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
