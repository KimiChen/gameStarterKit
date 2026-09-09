-- SLG 阶段 2a：与 api.march / sql.files / sql.tables 同批登记，不要求 slgWorld mode。
-- depart_at / arrive_at 是服务端 Unix 毫秒；位置由 shared positionAt(order, now) 确定。
CREATE TABLE IF NOT EXISTS k_slg_march (
  server_id SMALLINT UNSIGNED NOT NULL,
  march_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  from_tile INT UNSIGNED NOT NULL,
  to_tile INT UNSIGNED NOT NULL,
  depart_at BIGINT UNSIGNED NOT NULL,
  arrive_at BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, march_id),
  KEY idx_due (server_id, status, arrive_at, march_id),
  KEY idx_uid (server_id, uid, status),
  KEY idx_target (server_id, to_tile, status, arrive_at, march_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- dispatch / recall / settle 共用耐久回执；march_id 等于派遣操作身份。
CREATE TABLE IF NOT EXISTS k_slg_march_receipt (
  server_id SMALLINT UNSIGNED NOT NULL,
  op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, op_id),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 行军结束也追加 tombstone，使未来视图消费者能移除退出 active 集合的军队。
CREATE TABLE IF NOT EXISTS k_slg_march_log (
  server_id SMALLINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  march_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload JSON NOT NULL,
  tombstone TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, revision),
  KEY idx_created (server_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
