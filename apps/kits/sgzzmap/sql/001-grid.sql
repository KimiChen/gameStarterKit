-- sgzzmap P2：只由 db:bootstrap 按 kit_migration 账本应用；发布后只追加迁移。
-- ⚠ 回头改本文件会让下次 bootstrap 按设计 fail-closed（sha256 闸）。开发机恢复见 kit README §六。
-- 每区的所有世界写入先锁 k_sgzzmap_revision 本行，revision 分配与业务提交同事务，锁持有至 COMMIT。
CREATE TABLE IF NOT EXISTS k_sgzzmap_revision (
  server_id SMALLINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 地块稀疏存储：缺行即默认无主格（1500×1500=225 万格，⛔ 不预铺）。
-- cell = row*10000+col（上限 14 999 999 < 2^31）；唯一键插入冲突后在同一事务重读真实状态。
CREATE TABLE IF NOT EXISTS k_sgzzmap_tile (
  server_id SMALLINT UNSIGNED NOT NULL,
  cell INT UNSIGNED NOT NULL,
  owner_uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  owner_aid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  durability INT UNSIGNED NOT NULL DEFAULT 0,
  addition TINYINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, cell),
  KEY idx_owner (server_id, owner_uid),
  KEY idx_alliance (server_id, owner_aid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 每人持地计数与所属同盟。占领上限与「零地块玩家走出生豁免」都读它，⛔ 不去 COUNT(*) 扫地块表。
CREATE TABLE IF NOT EXISTS k_sgzzmap_holding (
  server_id SMALLINT UNSIGNED NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  alliance_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  tiles INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, uid),
  KEY idx_alliance (server_id, alliance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 请求回执绑定 uid、规范载荷摘要及契约版本；跨 RPC 缓存期仍原样重放响应。
CREATE TABLE IF NOT EXISTS k_sgzzmap_receipt (
  server_id SMALLINT UNSIGNED NOT NULL,
  kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, kind, op_id),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 世界变更日志：与业务写、回执同事务提交；tombstone 覆盖「恢复默认/删除」。
-- revision 来自上面那一个序列，各实体单独读取可有缺号；普通 AUTO_INCREMENT 不替代提交顺序。
CREATE TABLE IF NOT EXISTS k_sgzzmap_log (
  server_id SMALLINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  entity VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload JSON NOT NULL,
  tombstone TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, revision),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
