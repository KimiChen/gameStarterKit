# 05 · MySQL 8.0 表与写法

> **前置：生产 MySQL ≥ 8.0.19**（吃满 ODKU 行别名 / CHECK 强制 / 函数索引 / 多值索引）。
> 驱动用 `mysql2`（连接池 + `result.insertId` + `ResultSetHeader.affectedRows`）。

MySQL 只承载**货币 / 账号 / 订单 / 对局审计 / 协调**。玩法状态**不在这里**（见 [01](./01-architecture.md)）。

---

## 从 PostgreSQL 迁过来的构造映射

早期方案基于 PG，切 MySQL 8.0 时以下语义**不同**：

| PostgreSQL | MySQL 8.0 | 要点 |
|---|---|---|
| `TEXT PRIMARY KEY` | `VARCHAR(32) ascii_bin` | TEXT 不能整列做 PK。默认 `utf8mb4_0900_ai_ci` **大小写不敏感**，会让 `u_Ab` / `u_ab` 撞主键 |
| `BIGSERIAL` | `BIGINT AUTO_INCREMENT` | 非独立 sequence、不能跨表共享；有空洞。**8.0 计数器已持久化，重启不回退** |
| `TIMESTAMPTZ` | `DATETIME(3)` 存 UTC | 无时区类型。`TIMESTAMP` 有隐式时区转换 + 2038 上限 |
| `JSONB` | `JSON` | 不能直接建索引：抽生成列 + 函数索引（8.0.13+）。非 NULL 可用表达式默认 `DEFAULT (JSON_OBJECT())`（8.0.13+） |
| 部分唯一索引 `WHERE x IS NOT NULL` | 普通 `UNIQUE(x)` | InnoDB 唯一索引里多个 NULL 互不冲突，**天然等价** |
| `ON CONFLICT DO UPDATE` | `ON DUPLICATE KEY UPDATE` + `AS new` | **无仲裁列**：任一唯一键冲突都走同一 UPDATE 分支 |
| `ON CONFLICT DO NOTHING` | `ODKU id = id` | **别用 `INSERT IGNORE`** |
| `FOR UPDATE SKIP LOCKED` | 同名，**8.0 原生** | RR 下会加 gap 锁削弱 skip 效果，取行会话切 RC |
| 序列 | `seq` 表 + `LAST_INSERT_ID` | 无 sequence 对象 |
| `RANGE 分区` | 同，但 **PK 须含分区列** | 会打破 `match_id` 单独唯一性（见 Δ2） |
| `RETURNING id` | `result.insertId` / 回读 | MySQL 无 `RETURNING`（那是 MariaDB） |
| `pg_advisory_lock` | `singleton_lease` 表 + `fence_token` | ⛔ 别用 `GET_LOCK`（连接作用域，连接池下会泄漏） |

---

## ⚠️ 两个必须知道的陷阱

### Δ1 · 「批内同一 uid 报错」在 MySQL 消失

PG 的 `ON CONFLICT ... cannot affect row a second time`，在 MySQL 多值 ODKU 下**不报错**：按行顺序后者覆盖前者，**静默**。

> 靠这个报错发现重复的逻辑要改成**应用层去重**，或用 `version + GREATEST` 让结果与批内顺序无关。

### Δ2 · 分区约束打破 `match_id` 唯一性

MySQL 要求**分区键必须出现在每一个唯一键（含 PK）里**。所以 `match_results` 按时间分区后 PK 被迫写成 `(match_id, created_at)`。

**后果：同一 `match_id` 配不同 `created_at` 能插入多行**，重复结算不再被 UNIQUE 挡住。而这正是 [P7](./02-failure-patterns.md) 的「matchId 幂等」所依赖的唯一性。

**修法**：用一张**非分区**索引表做幂等闸（见下 `match_index`）。

---

## 表清单

| 表 | 用途 | 状态 |
|---|---|---|
| `accounts` | 账号、封禁、`token_epoch` | ✅ 已定稿 |
| `user_currency` | 货币余额【权威】 | ✅ |
| `currency_ledger` | 货币流水 + 幂等键 | ✅ |
| `gameplay_outbox` | 跨存储 intent（DDL 在 [04](./04-cross-store-outbox.md)） | ✅ |
| `singleton_lease` | 单例任务领导权 + fencing | ✅ |
| `purchases` | 微信支付订单状态机 | ✅ |
| `match_index` | `match_id` 幂等闸（非分区） | ✅ |
| `match_results` | 对局证据链【P7 审计】（分区） | ✅ |
| `mail` | 必达邮件【权威】 | ✅ |
| `login_audit` | 登录/撤销审计 | ✅ |
| `seq` | 单调发号（仅用于 `user_id`） | ✅ |
| `rank_award` | 发奖幂等 | ⏸ 依赖 [rating 算法拍板](./README.md#仍待拍板) |
| `rank_snapshot` | 榜快照（防 Redis 丢） | ⏸ 同上 |
| `user_snapshot_readonly` | **只读导出镜像**（BI/GM），非权威 | ✅ |
| `user_archive` | **冷档**（N 天未登录整档），冷用户的权威 | ✅ |

---

## DDL

### `accounts`

```sql
CREATE TABLE accounts (
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  openid        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  unionid       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  status        TINYINT UNSIGNED NOT NULL DEFAULT 0,      -- 0 正常 / 1 封禁 / 2 注销
  token_epoch   BIGINT UNSIGNED NOT NULL DEFAULT 0,       -- 撤销版本号（P1）
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_openid  (openid),
  UNIQUE KEY uk_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- `openid` / `unionid` 的 `UNIQUE` 允许多行 NULL —— 天然等价 PG 的部分唯一索引。
- **`token_epoch` 是撤销的持久真相**（[P1](./02-failure-patterns.md)）。封号 = `UPDATE status=1, token_epoch=token_epoch+1`，**先写 MySQL 再删 Redis session**。
- ⚠️ **`wx-login` 签发 token 前必须 `SELECT status`**，否则封号挡不住重新登录。

### `user_currency`

```sql
CREATE TABLE user_currency (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency   SMALLINT UNSIGNED NOT NULL,
  balance    BIGINT NOT NULL DEFAULT 0,
  version    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_fence BIGINT UNSIGNED NOT NULL DEFAULT 0,   -- fence 的 MySQL 持久形态（P6）
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, currency),
  CONSTRAINT chk_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- 复合 PK `(user_id, currency)` 让扣款走**主键等值锁**，避免 RR 下的间隙锁。
- `CHECK` 在 8.0.16+ 才真正强制。**不要只靠它** —— SQL 内用 `WHERE balance >= ?` 做原子守卫。

### `currency_ledger`

```sql
CREATE TABLE currency_ledger (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency      SMALLINT UNSIGNED NOT NULL,
  delta         BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  idem_key      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- = op_id
  reason        VARCHAR(64) NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_idem (user_id, idem_key),        -- 幂等下沉（P4）
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

> ⚠️ 幂等键必须是 `UNIQUE(user_id, idem_key)` 而非全局 `UNIQUE(idem_key)` —— 否则跨用户串号误判重复。
>
> `idem_key` = `gameplay_outbox.op_id` = Redis `applied:{uid}` 的 member。**三处同一个 id。**

### `singleton_lease`（relayer / 赛季轮换的领导权）

```sql
CREATE TABLE singleton_lease (
  lease_name   VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  holder       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- 实例 id
  fence_token  BIGINT UNSIGNED NOT NULL DEFAULT 0,        -- 单调递增，每次成功抢占 +1
  expires_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (lease_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 初始化
INSERT INTO singleton_lease (lease_name, holder, fence_token, expires_at)
VALUES ('outbox_relayer', '', 0, NOW(3)) ON DUPLICATE KEY UPDATE lease_name = lease_name;
```

**抢占**（过期才能抢，`fence_token` 单调 +1）：

```sql
UPDATE singleton_lease
   SET holder = ?, fence_token = fence_token + 1,
       expires_at = NOW(3) + INTERVAL ? SECOND
 WHERE lease_name = 'outbox_relayer' AND expires_at < NOW(3);
-- affectedRows = 1 → 抢到；随后回读拿 fence_token（MySQL 无 RETURNING）
SELECT fence_token FROM singleton_lease WHERE lease_name = 'outbox_relayer';
```

**续租 + 业务批写：必须同一个事务，守卫 UPDATE 作第一句**（[P6](./02-failure-patterns.md)）：

```sql
START TRANSACTION;
  UPDATE singleton_lease
     SET expires_at = NOW(3) + INTERVAL ? SECOND
   WHERE lease_name = 'outbox_relayer'
     AND holder = ? AND fence_token = ?;     -- 受影响 0 行 → 我已被顶替
  -- ↑ 0 行立即 ROLLBACK 并自杀，绝不继续往下写业务表

  UPDATE gameplay_outbox SET status = 1 WHERE op_id IN (...);
COMMIT;
```

> ⛔ **业务写绝不脱离 `fence_token` 守卫单独提交。** 这是 P6 的全部要点。

### `purchases`（微信支付订单）

```sql
CREATE TABLE purchases (
  order_id     VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- 商户订单号
  user_id      VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sku          VARCHAR(64) NOT NULL,
  amount_fen   INT UNSIGNED NOT NULL,
  status       TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 created / 1 paid / 2 delivered / 3 refunded / 4 closed
  wx_txn_id    VARCHAR(64) NULL,
  deliver_op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,  -- 发货用的 op_id
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_id),
  UNIQUE KEY uk_wx_txn (wx_txn_id),
  KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

> **`purchases` 与 `currency_ledger` 的分工**：`purchases` 是**充值订单**的状态机（真金 → 游戏币），微信支付回调驱动；`currency_ledger` 是**游戏币的每一笔增减流水**（含充值发货、购买消费、发奖、clawback）。充值发货 = `purchases.status → paid` 后，在同一事务里插 `currency_ledger`（正向 delta）并推进 `status → delivered`。

### `match_index` + `match_results`

```sql
-- 幂等闸：非分区表，match_id 单独唯一（Δ2）
CREATE TABLE match_index (
  match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (match_id)
) ENGINE=InnoDB;

-- 证据链：分区表，PK 必须含分区列
CREATE TABLE match_results (
  match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  mode       TINYINT UNSIGNED NOT NULL,
  payload    JSON NOT NULL,        -- 参与者、名次、seed、mapIndex、InjectWave 序列摘要
  PRIMARY KEY (match_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS (created_at) (
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);
```

写入顺序：先 `INSERT INTO match_index ... ODKU match_id = match_id`，`affectedRows = 0` 即重复 → 跳过；否则再写 `match_results`。

滚动加分区（瞬时元数据操作）：

```sql
ALTER TABLE match_results REORGANIZE PARTITION pmax INTO (
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);
ALTER TABLE match_results DROP PARTITION p2026_01;   -- 清理远快于 DELETE
```

- 查询必须带 `created_at` 条件才能分区裁剪。
- 分区表**不支持外键**。

### `mail`（必达邮件）

```sql
CREATE TABLE mail (
  mail_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title      VARCHAR(128) NOT NULL,
  body       VARCHAR(1024) NOT NULL,
  attach_op_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,  -- 附件走 outbox
  attach_effect JSON NULL,             -- 附件 Effect（M6 增列：领取时以此插 outbox intent）
  read_at    DATETIME(3) NULL,
  claimed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (mail_id),
  KEY idx_user_unread (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

> **投递状态以 MySQL `mail.read_at` / `claimed_at` 为唯一权威**，Redis Stream 只作实时唤醒。
> 这样就绕开了「consumer 名绑 node → 换 node 后旧 PEL 成孤儿」的丢邮件问题。

### `login_audit`

```sql
CREATE TABLE login_audit (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event      VARCHAR(24) NOT NULL,     -- wx_login | refresh | logout | revoke | ban | fail
  reason     VARCHAR(64) NULL,
  ip         VARBINARY(16) NULL,       -- INET6_ATON()
  device_id  VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

> `revoke` / `ban` / refresh 重放等高危事件**同步写**，普通 `login` 可批量。审计不能是尽力而为。

### `seq`（单调发号）

**唯一用途：生成 `user_id`。**（玩法侧的 `version` 对账已随决策 #6 删除，不再需要 `user_version`。）

```sql
CREATE TABLE seq (
  name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  val  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB;

-- 迁移时【必须预置行】，否则首次采番返回错值（见下）
INSERT INTO seq (name, val) VALUES ('user_id', 0);
```

### `user_archive`（冷档）

冷用户整档的**权威**存放处。详见 [08 · 冷档冻结层](./08-cold-archive.md)。

```sql
CREATE TABLE user_archive (
  user_id        VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot       JSON NOT NULL,              -- user 全字段 + bag 各分片 + applied 成员集合
  schema_version SMALLINT UNSIGNED NOT NULL,
  fence_hwm      BIGINT UNSIGNED NOT NULL,   -- fence 高水位：权威判定与 thaw 恢复都靠它
  frozen_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),                     -- ⚠️ 每个 uid 只能有一行
  KEY idx_frozen (frozen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  ROW_FORMAT=COMPRESSED;                     -- JSON 可压 3–5 倍：190GB → ~50GB
```

- **`fence_hwm` 是权威判定的依据**：`archive.fence_hwm > redis.user.fence` ⇒ archive 更新（PITR 场景）。⛔ 不要用「谁存在」判权威。
- ⛔ **不要按 `frozen_at` 做 RANGE 分区。** 分区键必须进 PK（Δ2），那会让 `user_id` 单独不再唯一 →
  同一个 uid 可能出现两行不同 `frozen_at` 的档，`resolve()` 无从判断哪行是权威。**`PRIMARY KEY (user_id)` 是正确性要求。**
- 清退超期死号改用**分批 `DELETE ... WHERE frozen_at < ? LIMIT 1000`**（配合 `idx_frozen`），或 `PARTITION BY KEY(user_id)`（PK 仍成立，但没有时间维度的 `DROP PARTITION`）。
- freeze 用 `ODKU` 幂等 upsert，`fence_hwm` 取 `GREATEST`。
- ⚠️ 鲸鱼档 snapshot 可达 MB 级，**必须 < `max_allowed_packet`**（`mysql2` 默认 16MB）。
- 「snapshot 利于 BI」要打折：千万行**无生成列索引**的 JSON 查询就是全表扫，它只适合**点查 / 取证**。

### `user_snapshot_readonly`（只读导出镜像）

⚠️ **非权威、不回写、不参与恢复。** 仅供 BI / GM / 风控查询。由单向导出 worker 写入。

```sql
CREATE TABLE user_snapshot_readonly (
  user_id    VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot   JSON NOT NULL,
  ver        BIGINT UNSIGNED NOT NULL,    -- 来自 Redis user:{uid} 的 ver 字段
  synced_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

`ver` 只用于**导出去重/乱序保护**（后到的旧 ver 不覆盖新 ver），⛔ **严禁**用它做玩法档回写或对账 —— 那正是已删除的 `user_snapshot` + version 对账机制。

---

## 关键写法

### 幂等插入去重

```sql
INSERT INTO currency_ledger (user_id, idem_key, currency, delta, balance_after, reason)
VALUES (?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE id = id;
-- result.affectedRows = 0 → 重复；= 1 → 新插入
```

> ⛔ **绝不用 `INSERT IGNORE`** —— 它把截断 / NOT NULL / FK / CHECK 违反**全部降级为 warning** 一并吞掉。
> ODKU `id = id` 只吞唯一键冲突，其余错误正常抛出。
>
> `affectedRows` 在 `mysql2` 的 `ResultSetHeader` 上（`const r = await conn.execute(...)` → `r.affectedRows`），**不在连接对象上**。

### 条件 upsert：仅当新版本更大才覆盖

> ⚠️ **此模式仅限单向只读镜像**（`user_snapshot_readonly`）。⛔ **严禁用于玩法档回写。**

```sql
INSERT INTO user_snapshot_readonly (user_id, snapshot, ver)
VALUES (?, CAST(? AS JSON), ?) AS new
ON DUPLICATE KEY UPDATE
  snapshot = IF(new.ver > user_snapshot_readonly.ver, new.snapshot, user_snapshot_readonly.snapshot),
  ver      = GREATEST(user_snapshot_readonly.ver, new.ver);
```

- 行别名 `AS new` 需 **8.0.19+**（更早写 `VALUES(col)`，已弃用）。
- ⚠️ ODKU **只更新你列出的列**。新增列必须一并列出，否则新版赢时旧列不更新。
- `affectedRows`：insert=1 / update=2 / 值未变=0。**无法据此判断「是否被旧版本挡下」**，要确知须回读。

### 单调发号（无原生 sequence）

```sql
-- 必须在同一根物理连接上执行这两条
UPDATE seq SET val = LAST_INSERT_ID(val + 1) WHERE name = 'user_id';
SELECT LAST_INSERT_ID();
```

```ts
const conn = await pool.getConnection();       // ⚠️ 必须同一根连接
try {
  await conn.execute(`UPDATE seq SET val = LAST_INSERT_ID(val + 1) WHERE name = ?`, ['user_id']);
  const [rows] = await conn.query(`SELECT LAST_INSERT_ID() AS v`);
  return rows[0].v;
} finally { conn.release(); }
```

> ⚠️ **不要用惰性建行的 ODKU 写法**：
> `INSERT INTO seq VALUES (?,1) ON DUPLICATE KEY UPDATE val = LAST_INSERT_ID(val+1)`
> —— 首次是**纯 INSERT**，ODKU 分支不执行，`LAST_INSERT_ID()` 返回会话旧值（新连接为 0）。**首次采番就是错的。**
>
> ⚠️ `LAST_INSERT_ID()` 是**连接局部**的。用 `pool.query` 两次调用会落到不同物理连接 → 取到错值。

### skip-locked 取行（outbox）

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;   -- 需 binlog_format=ROW
START TRANSACTION;
SELECT op_id FROM gameplay_outbox
 WHERE status = 0 AND created_at < NOW(3) - INTERVAL 5 SECOND
 ORDER BY created_at, op_id
 LIMIT 100
 FOR UPDATE SKIP LOCKED;
COMMIT;
```

RR 下 `FOR UPDATE` 会对扫描范围加 next-key 锁，可能把未到期行的间隙也锁住，削弱 skip 效果。切 RC 后只加命中行的记录锁。

### 双边转账 + 死锁重试

```sql
START TRANSACTION;
-- 应用层按 user_id 升序固定加锁顺序，消除 ABBA 死锁
UPDATE user_currency SET balance = balance - ?, version = version + 1
 WHERE user_id = ? AND currency = ? AND balance >= ?;   -- affectedRows=0 → 余额不足，回滚
UPDATE user_currency SET balance = balance + ?, version = version + 1
 WHERE user_id = ? AND currency = ?;
INSERT INTO currency_ledger (...) VALUES (...), (...);
COMMIT;
```

外层捕获 **errno 1213（死锁）/ 1205（锁等待超时）** → 指数退避重试。

---

## MySQL 8.0 相对 PG 的新坑

| 坑 | 影响 | 对策 |
|---|---|---|
| **默认 `REPEATABLE READ` + gap / next-key 锁** | 并发范围写、outbox 取行的死锁远多于 PG RC | 写路径一律**主键等值定位**；货币/转账/outbox 会话切 RC（需 `binlog_format=ROW`）；保留死锁重试 |
| **多步 DDL 不可整体回滚** | 单条 DDL 在 8.0 是原子/崩溃安全的，但 expand-contract 的多步**不是一个事务** | 大表 ALTER 用 `gh-ost` / `pt-osc`；小改用 `ALGORITHM=INSTANT`；每步幂等可重入 |
| **`utf8mb4` 默认排序不敏感** | `u_Ab` / `u_ab` 撞主键 | id / token / hash / `idem_key` 用 `ascii_bin` |
| **索引键长 3072B 上限** | 长 VARCHAR 联合唯一键可能超限 | `UNIQUE(user_id VARCHAR(32), idem_key VARCHAR(64))` ascii = 96B，安全 |
| **无 `RETURNING`** | 插入 / CAS 后拿不到新值 | 自增用 `result.insertId`；CAS 用 `affectedRows` 判成败；确需新值同事务内 `SELECT` |
| **`LAST_INSERT_ID()` 连接局部** | 连接池下两次调用落到不同连接 | 用 `pool.getConnection()` 取一根连接执行 |
| **`JSON` 列被 mysql2 自动解析** | 读出来是 JS 对象不是字符串 | 传给 Redis Lua 前显式 `JSON.stringify` |
| **`AUTO_INCREMENT` 有空洞** | 回滚/失败跳号 | 别当连续编号或对账依据 |
| **mysql2 默认开 `CLIENT_FOUND_ROWS`** | ODKU 命中重复也报 `affectedRows=1`（matched 语义）——本篇全部「插入=1/重复=0」幂等判断**静默失效**（M6 实测踩中） | 连接池显式 `flags: ['-FOUND_ROWS']`（已在 `infra/mysql.ts` 固化），恢复 changed 语义 |

---

## 存量迁移 runbook（SQLite → MySQL + Redis）

**现状**（`apps/server/src/services/db.ts`）：

```sql
users (user_id TEXT PK, token_hash TEXT, save TEXT /* PlayerSave JSON blob */, updated_at INTEGER)
game_reports (...)
```

整块 `save` blob 要**拆成两半**：货币进 MySQL，其余进 Redis Hash。

### 字段映射

| `save` JSON 字段 | 去处 |
|---|---|
| `coin` / `diamond` 等余额 | MySQL `user_currency(user_id, currency, balance)` |
| `bag` / 道具数量 | Redis `bag:{uid}:{shard}`，field = `itemId` |
| `level` / `exp` / `power` / `star` | Redis `user:{uid}` 的标量 field |
| 其余大对象（成就、进度） | Redis `user:{uid}` 的 JSON blob field |
| `token_hash` | **不迁移**。`accounts` 无此列；旧 token 体系随 cutover 作废。过渡期用旧 token 验明身份后把 openid 回填 `accounts`（**存量账号绑定协议**，见 [10·M3](./10-implementation-plan.md#m3--鉴权https-wx-login--token--存量账号绑定)） |

> 具体字段名以 `@fable5/shared` 的 `PlayerSave` 类型为准。**先补一张逐字段映射表再动手。**

### 执行顺序

1. **建表**：MySQL 全部 DDL + `seq` 预置行。
2. **ETL 回填**（停写窗口或影子模式）：遍历 SQLite `users`，对每行
   - `JSON.parse(save)` → 校验合法性（失败的单独记录，人工处理）
   - 货币 → `INSERT INTO user_currency`
   - 玩法字段 → `HSET user:{uid}` + `HSET bag:{uid}:{shard}`
   - `HSET user:{uid} schemaVersion 1  fence 0  ver 0`
3. **双写期**（可选，降风险）：
   - **货币：MySQL 权威**，SQLite 只写不读。
   - **玩法：Redis 权威**，SQLite 只写不读。
   - 影子读比对：随机抽样 `user_id`，比对两侧余额/背包，差异告警。
4. **cutover**：切读流量到 MySQL + Redis，SQLite 转只读备份。
5. **回滚预案**：保留 SQLite 文件与 ETL 前快照，48 小时内可回切。

> ⚠️ **双写期的权威归属必须单一，不能「两边都写、都可读」** —— 那会立刻复活 [P5](./02-failure-patterns.md) 的双写者发散问题。

### 迁移后

`users.save` 列**只作导出/审计**用途，玩法真源已经是 Redis。⛔ **不要让它成为第二写者。**

`saveStore` 的对外接口保持不变，只换实现。
