-- sgzzmap P3：最小同盟（建盟 / 加入 / 退出，⛔ 无外交系统）。追加迁移，⛔ 不改 001。
-- alliance_id 由每区 revision 序列派生（建盟那一刻的 revision），⛔ 不引 AUTO_INCREMENT：
-- per-zone 表的 PK 必带 server_id，InnoDB 的复合 PK 不支持自增列不在首位。
CREATE TABLE IF NOT EXISTS k_sgzzmap_alliance (
  server_id SMALLINT UNSIGNED NOT NULL,
  alliance_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(48) NOT NULL,
  tag VARCHAR(16) NOT NULL,
  leader_uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  members INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, alliance_id),
  UNIQUE KEY uk_tag (server_id, tag),
  KEY idx_leader (server_id, leader_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 一人一盟：PK (server_id, uid) 天然禁止重复入盟，⛔ 不靠应用层查重。
CREATE TABLE IF NOT EXISTS k_sgzzmap_alliance_member (
  server_id SMALLINT UNSIGNED NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  alliance_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, uid),
  KEY idx_alliance (server_id, alliance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
