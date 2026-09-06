-- arena kit 世界棋盘（docs/KIT.md §5：账本驱动，只由 db:bootstrap 应用；⛔ 不改已发布迁移，演进只追加文件）
-- per-zone 表：server_id 进主键；owner_uid 为空串 = 无主格；power 是格子的守备值。
CREATE TABLE IF NOT EXISTS k_arena_board (
  server_id SMALLINT UNSIGNED NOT NULL,
  tile SMALLINT UNSIGNED NOT NULL,
  owner_uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  power INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, tile),
  KEY idx_owner (server_id, owner_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 占领回执：arena.capture 每个 opId 一行（与棋盘写同一事务），重放只回读——kit 自己的幂等账本，
-- ⛔ 不靠 dispatcher 的 idem 结果缓存（60s TTL）。op_id 形态与 gameplay_outbox.op_id 同（kitOpId → uuidv5）。
CREATE TABLE IF NOT EXISTS k_arena_attempt (
  server_id SMALLINT UNSIGNED NOT NULL,
  op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tile SMALLINT UNSIGNED NOT NULL,
  outcome VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  power INT UNSIGNED NOT NULL,
  owner_uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, op_id),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
