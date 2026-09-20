-- mmo kit · 物品与回执（docs/MMO.md §7.3；MK3 inventory 面消费，MK0 只建表）。
-- k_mmo_item_instance：唯一物品实例；(owner, location, slot) 唯一——同一格只能有一个实例；count 是堆叠数；rev 每次变动 +1。
CREATE TABLE IF NOT EXISTS k_mmo_item_instance (
  server_id SMALLINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  template_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_character_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  location VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  slot SMALLINT UNSIGNED NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 1,
  rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, item_id),
  UNIQUE KEY uk_mmo_item_slot (server_id, owner_character_id, location, slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- k_mmo_receipt：资产操作回执（op_id = 框架 kitOpId / 事件 id；重放只回读——kit 自己的幂等账本，⛔ 不靠 dispatcher 的 idem 结果缓存）。
CREATE TABLE IF NOT EXISTS k_mmo_receipt (
  server_id SMALLINT UNSIGNED NOT NULL,
  op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  character_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, op_id),
  KEY idx_mmo_receipt_character (server_id, character_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
