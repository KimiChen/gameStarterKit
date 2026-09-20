-- mmo kit · 分线（docs/MMO.md §7.3）。以框架 world_instance.instance_id 为键，只存 kit 语义；⛔ 不建 k_mmo_transfer（交接表归框架）。
CREATE TABLE IF NOT EXISTS k_mmo_instance (
  server_id SMALLINT UNSIGNED NOT NULL,
  instance_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  map_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pack_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pack_version INT UNSIGNED NOT NULL DEFAULT 0,
  script_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, instance_id),
  KEY idx_mmo_instance_map (server_id, map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- k_mmo_instance_checkpoint：分线检查点（框架信封整份落 envelope；snapshot{tick, rngState, creatures, loot, scriptVars, timers, regions}）；
-- 只追加，Recovering 取最大 rev；回退窗口 ≤ 1 个分线检查点周期（§7.3；boss 死亡强制点 checkpointOnDeath）。
CREATE TABLE IF NOT EXISTS k_mmo_instance_checkpoint (
  server_id SMALLINT UNSIGNED NOT NULL,
  instance_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rev BIGINT UNSIGNED NOT NULL,
  tick BIGINT UNSIGNED NOT NULL DEFAULT 0,
  event_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
  state_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  envelope JSON NOT NULL,
  saved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, instance_id, rev)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- k_mmo_world_event：世界事件 outbox（role:"world-event"，框架固定列集 event_id / instance_id / seq / kind / payload / status / attempts /
-- checkpoint_rev；status 0 pending / 1 done / 2 dead / 3 superseded）。事件批只随分线检查点同事务落库（MF7b 选项 ④），
-- worker（workers/worldEvents.ts）只认领 checkpoint_rev ≤ 已落库 rev 的行。actor_character_id / pack_id 是 kit 语义列（框架不写）。
CREATE TABLE IF NOT EXISTS k_mmo_world_event (
  server_id SMALLINT UNSIGNED NOT NULL,
  event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  instance_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  seq BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_character_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  pack_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payload JSON NOT NULL,
  status TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  checkpoint_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, instance_id, seq),
  UNIQUE KEY uk_mmo_world_event_id (server_id, event_id),
  KEY idx_mmo_world_event_status (server_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
