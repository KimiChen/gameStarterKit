# 01 · 架构总览

## 拓扑

```
                    ┌─────────────────────────┐
                    │   微信小游戏客户端        │
                    │   wx.login() → code     │
                    └───┬──────┬──────────┬───┘
              HTTPS     │      │ WSS      │ WSS(join)
                        │      │ +token   │
        ┌───────────────▼─┐ ┌──▼────────┐ ┌▼──────────────┐
        │ ① 鉴权服务      │ │ ② 网关节点 │ │ ③ 游戏节点     │
        │ /auth/wx-login  │ │ LobbyRoom │ │ VersusRoom    │
        │ code2session    │ │ + RPC     │ │ 裁判模型       │
        │ 签发不透明 token │ │ dispatcher│ │ 无状态·可 drain│
        └───────┬─────────┘ └─────┬─────┘ └──┬─────────┬──┘
                │                 │          │         │
                │      玩法直写   │          │         │ 货币:同步事务
                ▼                 ▼          ▼         ▼
        ┌──────────────────────────────────┐  ┌────────────────┐
        │ Redis · DURABLE (纯 RAM)         │  │  MySQL 8.0     │
        │ noeviction · AOF everysec        │  │  primary→replica│
        │                                  │  │                │
        │ user:{uid}   玩法档【真源】       │  │ user_currency  │
        │ sess:{uid}   会话态(TTL)          │  │ currency_ledger│
        │ lock:{uid}   withUser 锁+fence    │  │ accounts       │
        │ applied:{uid} 幂等已 apply 集合    │  │ purchases      │
        │ rank:*       排行 ZSET            │  │ gameplay_outbox│
        │ idem:*       幂等占位             │  │ match_results  │
        └──────────────────────────────────┘  └───────┬────────┘
        ┌──────────────────────────────────┐          │
        │ Redis · CACHE (allkeys-lru)      │   ┌──────▼────────┐
        │ 可丢:热档只读缓存、榜展示缓存      │   │ outbox relayer │
        └──────────────────────────────────┘   │ 崩溃收敛(幂等) │
                        ▲                      └──────┬────────┘
                        └─────────── 幂等 apply ──────┘
```

> **两个 Redis 实例必须物理隔离。**「放独立逻辑库 `SELECT n` 就能隔离内存策略」是**技术错误**——`maxmemory-policy` 是实例级配置，逻辑库共享同一 `maxmemory`。

---

## 连接生命周期

1. 客户端 `wx.login()` 拿临时 `code`。
2. **HTTPS** `POST /auth/wx-login {code, deviceId, nonce, ts}` → 服务端 `code2session` 换 `openid` → 建号/取号 → 签发**不透明 token**（CSPRNG 随机串，`sha256` 后作 key 存 Redis）。
   - `session_key` **仅服务端持有，绝不下发**。
   - 出参不含 `openid` / `unionid` / `session_key`。
3. **WSS** 握手带 token → Colyseus `onAuth` 校验 → `userId` **由 token 反查**（禁止客户端传 `userId`）→ 挂到 `client.auth`。
4. 客户端 join 共享 **`LobbyRoom`**，走单一 `rpc` 消息通道取用户数据/排位：
   - 信封 `{id, type, payload}` → `{id, ok, data, err}`（`id` 做请求/响应配对）
   - `type → handler` 路由表，handler 独立成 `handlers/*.ts`
   - 前置中间件：鉴权 → 限流 → zod 校验 → 幂等占位
5. 匹配后 join **`VersusRoom`** 对战（Colyseus 原生 seat reservation）。
6. 结算按数据分级落库（见下）。

---

## 数据分级（核心）

这张表决定每一次写走哪条路。**写代码前先确认你的字段属于哪一级。**

| 类别 | 例子 | 真源 | 写路径 | RPO |
|---|---|---|---|---|
| **关键 · 真金** | 货币余额、充值订单、账号状态 | **MySQL 8.0** | 同步事务 + `currency_ledger` UNIQUE 幂等 | **0** |
| **贵重玩法效果** | 付费抽卡出金、购买道具、赛季奖励 | Redis（+ MySQL intent 兜底） | MySQL 事务落 `gameplay_outbox` intent → 幂等 apply Redis → relayer 重放收敛 | **0**（intent 持久） |
| **普通玩法** | 背包常规变动、进度、战力、成就 | **Redis** (durable) | `withUser` + Lua CAS 直写 hash，**不落 MySQL** | ≤1s（AOF everysec）+ failover 复制延迟 |
| **易失** | 局内状态、在线态、匹配队列 | Redis / 进程内存 | 无所谓 | 可丢 |
| **冷档** | 上面「普通玩法」的整档，**N 天未登录** | **MySQL `user_archive`** | 冻结 worker 序列化；访问时懒解冻 | 同 MySQL |

> ⚠️ **「玩法真源 = Redis」的唯一例外就是最后一行。** 访问冷 uid **必须先 `ensureLive()` 解冻**；
> 任何写路径都**不得隐式创建** `user:{uid}`（Lua 返回 `cold`）。详见 [08 · 冷档冻结层](./08-cold-archive.md)。

### 判断口径

> **「这个字段掉了，会不会有人来投诉或退款？」**
>
> - 会退款 → 关键（MySQL 同步事务）
> - 会投诉、且是花钱换来的 → 贵重玩法效果（走 outbox intent）
> - 会投诉、但能重打 → 普通玩法（Redis）
> - 不会 → 易失

---

## 为什么玩法状态不落 MySQL

早期方案是「Redis 热缓存 + 每分钟 flush 到 MySQL」（write-behind）。已废弃，原因：

1. **flush 延迟 = 真实 RPO 洞。** 即便有管道，Redis 领先 MySQL 的那段 delta 不可恢复——重建出来的背包是几十秒前的旧值，玩家「刚打完的关回退、刚抽的卡蒸发」。
2. **两个写者 = 永久发散。** 游戏节点用非幂等 `HINCRBY` 直写 Redis，flush worker 用幂等语义写 MySQL；at-least-once 重放一次，两边就再也对不上，且以谁为准无解。
3. **真源单一后，竞态消失。** 只有一个存储，没有副本可发散，version 条件写与对账 job 全部不需要。

### 因此删掉了

- `dirty:users:{shard}` 脏集合 + `RENAME` 快照
- `user_snapshot` 表
- flush worker 的定时快照通道
- 玩法侧的 version 条件 `UPSERT` 与对账 job
- `stream:progress`

### 因此保留

- **`stream:match`** —— 但**重新定性**：它不是玩法状态副本，是 **P7 反作弊无头重放 / 发奖 / clawback 的证据链**，落 MySQL `match_results` 作权威审计表。
- `mail` 必达流（至少一次投递 + 客户端按 mail id 去重）
- `currency_ledger`、支付 `outbox`

### 因此新增

- **`gameplay_outbox`** + relayer（见 [04](./04-cross-store-outbox.md)）
- **单向只读导出通道**（Redis → 数仓 / 只读镜像），供 BI / GM 客服 / 风控 / 审计回滚。
  **明确：非权威、不回写、不参与恢复。**
- 16384 虚拟桶路由表 + **冷档冻结层**（见 [06](./06-capacity-and-ops.md) 与 [08](./08-cold-archive.md)）

---

## 组件职责

| 组件 | 职责 | 部署形态 |
|---|---|---|
| 鉴权服务 | `code2session`、签发/校验/撤销 token、登录限流 | 无状态，可水平扩容 |
| 网关节点 | `LobbyRoom` + RPC dispatcher + 服务端主动推送 | 无状态，WS 需 sticky |
| 游戏节点 | Colyseus 房间、权威 state、结算 | 无状态，可 drain |
| **outbox relayer** | 消费 `gameplay_outbox` pending，幂等 apply 到 Redis | **单例**（fencing 租约） |
| 导出 worker | Redis → 数仓单向导出 | 单例，可丢 |
| Redis durable | 玩法真源、会话、锁、幂等、排行 | `noeviction` + 纯 RAM + 主从 |
| Redis cache | 热档只读缓存、榜展示缓存 | `allkeys-lru`，**物理独立实例** |
| MySQL 8.0 | 货币/账号/订单权威 + 对局审计 | primary → replica |

> **单例任务（relayer、赛季轮换）绝不能每个节点跑一份。** 用 `singleton_lease` 表 + fencing token，且 **token 必须守到业务写**——把「lease 守卫 UPDATE」和「业务批写」放进**同一个 MySQL 事务**，守卫 UPDATE 作第一句，受影响 0 行立即 `ROLLBACK` 并自杀。详见 [P6](./02-failure-patterns.md)。

---

## Redis 实例划分

| 实例 | 配置 | 存什么 |
|---|---|---|
| `redis-durable` | 纯 RAM · AOF `everysec` · `maxmemory-policy noeviction` | `user:{uid}`、`bag:{uid}:*`、`fence:{uid}`、`applied:{uid}`、`sess:{uid}`、`lock:{uid}`、`idem:*`、`rank:*`、`rank_sub:*` |
| `redis-cache` | `allkeys-lru`，可丢 | `cache:currency:{uid}`（货币只读缓存）、榜展示临时缓存、列表页缓存 |

**不变量**：**权威玩法数据 `user:{uid}` / `bag:{uid}:*` / `fence:{uid}` 无 TTL** —— 任何驱逐 = 数据丢失。

协调类 key（`lock` PX 5s、`idem` 短租约、`sess` 3d）**按用途设短 TTL**，这不违反上面的不变量：它们可重建或本就该过期。

完整 key 表见 [07](./07-contracts-and-config.md#redis-key-全表)。

---

## 下一步

- 具体的失效模式与修法 → [02 · 七个失效模式](./02-failure-patterns.md)
- 网关怎么写 → [03 · 网关数据层](./03-gateway-data-layer.md)
