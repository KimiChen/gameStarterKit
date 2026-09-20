-- sgzzmap P5：鸟瞰分块聚合。追加迁移，⛔ 不改 001/002/003。
-- 远档（LOD ≥ 4）不逐格发数据，改发**预聚合**的分块摘要：每块按同盟统计占格数。
-- ⚠ 聚合随占领/弃地/到达在**同一事务**里 upsert，⛔ 不做定时重算，也⛔ 不实时 COUNT 扫地块表。
-- alliance_id = '' 表示「有主但无盟」；无主格不入表（缺行即 0）。
CREATE TABLE IF NOT EXISTS k_sgzzmap_chunk (
  server_id SMALLINT UNSIGNED NOT NULL,
  level TINYINT UNSIGNED NOT NULL,
  chunk_key INT UNSIGNED NOT NULL,
  alliance_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  tiles INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, level, chunk_key, alliance_id),
  KEY idx_scan (server_id, level, chunk_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
