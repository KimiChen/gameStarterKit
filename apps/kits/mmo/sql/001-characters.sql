-- mmo kit · 角色（docs/MMO.md §7.3；docs/KIT.md §5：账本驱动，只由 db:bootstrap 应用；⛔ 不改已发布迁移，演进只追加文件）
-- k_mmo_character：角色身份与成长。persona_id 是框架 persona 表的键（⛔ 无外键，KIT.md §2）；user_id 冗余自 persona（kit ⛔ 直接读 persona 表）；
-- ⛔ 不放位置 / HP / MP / 冷却——它们的唯一真源是 k_mmo_character_checkpoint（M08），checkpoint_rev 指向最新已落库的角色检查点。
CREATE TABLE IF NOT EXISTS k_mmo_character (
  server_id SMALLINT UNSIGNED NOT NULL,
  character_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  persona_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  name VARCHAR(16) NOT NULL,
  class_id VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  faction_id VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  exp BIGINT UNSIGNED NOT NULL DEFAULT 0,
  checkpoint_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, character_id),
  UNIQUE KEY uk_mmo_character_name (server_id, name),
  UNIQUE KEY uk_mmo_character_persona (server_id, persona_id),
  KEY idx_mmo_character_user (server_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- k_mmo_character_checkpoint：角色检查点（框架信封整份落 envelope：rev / eventOffset / authorityEpoch / controlEpoch / schemaVersion / stateHash /
-- snapshot{mapId, x, y, heading, hp, mp, cooldowns}）；只追加，load 取最大 rev；回退窗口 ≤ 1 个角色检查点周期（§7.3）。
CREATE TABLE IF NOT EXISTS k_mmo_character_checkpoint (
  server_id SMALLINT UNSIGNED NOT NULL,
  character_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rev BIGINT UNSIGNED NOT NULL,
  instance_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
  state_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  envelope JSON NOT NULL,
  saved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, character_id, rev)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
