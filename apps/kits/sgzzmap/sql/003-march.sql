-- sgzzmap P4：行军。追加迁移，⛔ 不改 001/002。
-- 服务端只存**转折点**（path_json），逐格路径由两端用同一个 sgzzExpandPath 展开。
-- 到达时刻由路径重算校验，⛔ 不信任线上传来的数字。
CREATE TABLE IF NOT EXISTS k_sgzzmap_march (
  server_id SMALLINT UNSIGNED NOT NULL,
  march_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  path_json JSON NOT NULL,
  depart_at BIGINT UNSIGNED NOT NULL,
  arrive_at BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, march_id),
  -- 结算队列按「全区总序」扫：同目标的较早到达绝不会被分页跳过
  KEY idx_due (server_id, status, arrive_at, march_id),
  KEY idx_uid (server_id, uid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
