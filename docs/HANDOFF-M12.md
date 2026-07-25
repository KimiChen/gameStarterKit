# 交接文档：M12c 账号门户抽出 + M12d 撤销/踢在线

> **交接时间**：2026-07-25 ｜ **分支**：`new`（已 push，与 `origin/new` 同步）
> **状态**：M12c ✅ 完成 · M12d ✅ 完成（剩余项均已入待办账本，见 §7）
> **验证基线**：typecheck 三端+client + `verify:sync` / `test:int` **108** / 服务端单测 **22** / `test:fgui` **72** —— 全绿
>
> 设计规格见 [DUAL_MODE.md](DUAL_MODE.md)（§2.3 撤销、§2.7 门户）；门户契约与待办账本见 [WEBPLATFORM.md](WEBPLATFORM.md)；
> 服务端规则目录见 [SERVER.md §12](SERVER.md)（本轮相关：`09·G7` / `G7b` / `G7c`）。

---

## 1. 一句话现状

账号平面（身份/令牌/角色注册表/选服目录）已从游戏服抽成独立可部署的 **WebPlatform**，
用 **`AccountClient` 接缝** 支撑「dev/test 内嵌、prod 拆进程」两种形态；
**封号** 收敛为「账号级两位权威 + 两步 SOP」，在线撤销由 **GM 工具确认送达**。

---

## 2. 本轮交付

| 里程碑 | 内容 |
|---|---|
| **M12c** | 账号原语（verify/token/character/accountExists）+ 登录编排 + code2session + 选服目录 `/area/list` 迁 `@game/webplatform/lib`；Fastify 独立进程；`ACCOUNT_MODE` 开关；客户端 login/area 走门户 `portalUrl`；onAuth 懒填组 sess；split 全链 e2e |
| **M12d** | 封号模型（`status` + `token_hash` 两位权威）；踢人通道 `stream:kick`（每节点自筛）；GM `/admin/kick`（ack + fail-closed）；踢 = 先推 `forceLogout{reason}` + 语义化关闭码；顶号主动踢；撤销/目录全走接缝 + 机检 |
| 顺带 | 大厅 join 透传所选区 `sId`（`52e290b`，此前区服模式下大厅档会落 `sId=0`） |

---

## 3. 三个核心模型（先读这节，再读代码）

### 3.1 封号 = 账号级「下次登不上」+ 踢在线（两步**都必做**，`09·G7`/`G7b`）

```
① 写权威（WebPlatform /ban，或组侧 banUser → account.ban 接缝）
     UPDATE accounts SET status=1, token_hash=NULL
     └→ 新建连接（onAuth strict 回权威）/ 重新登录（login 查 status）→ 即时拒
② 踢在线（GM 工具**逐节点** POST /admin/kick，按 ack 汇总确认）
     └→ kickUser: 先推 auth.forceLogout{reason} → 再用语义化关闭码关连接
```

- **权威只有两位**：`accounts.status`(1=封禁) + `accounts.token_hash`(NULL=已撤销/换发)。
  ⛔ 无 `token_epoch` fence、⛔ 无 `revocation_log` outbox、⛔ 无 `maxEpoch` 本地缓存、⛔ 无 `verifiedAt` 周期回权威。
- **⛔ 缺 ② 无自动收敛**：在场连接可存活至 `sess` TTL（3d）——快路径是**纯缓存 hash 比对、零权威回源**。
  这是**刻意接受的代价**（见 §8），已由特征化测试钉住（`revoke.test.ts`「缺踢无自动收敛」）。
- `stream:kick` 是**程序化封号的便捷扇出**（fire-and-forget、无 ack），**不构成保证**。

### 3.2 单端语义与顶号（`09·G7c`）

`accounts.token_hash` 是**一个列** ⇒ 一账号同时只有一个有效 token ⇒ 换端登录即顶号。

**判据（精确到"换了登录态"）**：`writeGroupSess` 发现组 sess 里**原本存着不同的 tokenHash** ⇒ 踢旧连接（`reason=replaced`）。
- ⛔ 断线重连**不命中**（复用同 token、hash 未变、不经登录）；首连/sess 过期（`oldHash=null`）也不命中。
- 踢人事件带 **`exceptHash` 判别位**：跳过持新登录态的连接 ⇒ **不自踢**（本节点消费者会读回自己发的广播，跨节点亦然）。

> ⚠ **要支持多端同时在线是数据模型变更**：需引入 `sessions` 表（per-device 行）+ `verify` 改按 token 查行，**不是加个字段**。

### 3.3 部署模式（同一份账号逻辑两种跑法）

| 模式 | 账号逻辑 | 库 | 客户端 login/area 打谁 |
|---|---|---|---|
| `in-process`（dev/test 缺省） | 游戏服直接 import `@game/webplatform/lib` | 与游戏服**共库** | 游戏服（`portalUrl` 留空即回退） |
| `http`（prod split） | WebPlatform 独立进程（Fastify） | **独立账号库** | WebPlatform（`portalUrl`） |

---

## 4. 代码地图

### 账号平面接缝（`apps/server/src/platform/`）

| 文件 | 职责 |
|---|---|
| `accountClient.ts` | `AccountClient` 接口 + 按 `ACCOUNT_MODE` 选实现。业务侧**一律**用它导出的 `account.*` |
| `inProcessAccount.ts` | 内嵌实现：直调 lib；含 `verifySessionStrict` / `verifyBearer` |
| `httpAccount.ts` | split 实现：HTTP → WebPlatform；strict verify 成功后**懒填组 sess** |
| `inProcessLogin.ts` | 登录编排薄委托（**in-process 专用**；split 下游戏服登录端点 404） |

接口面：`verify(token,strict)` / `character.{register,query,has}` / `accountExists` / `ban` / `revoke` / `areaList`。

### 组侧会话与撤销（`apps/server/src/core/auth/`）

| 文件 | 职责 |
|---|---|
| `session.ts` | **纯组 Redis 缓存 + 审计**（`writeGroupSess`/`verifySession`/`auditLogin`/`tokenHashOf`）。⛔ 零 lib 导入 |
| `kickBus.ts` | **踢人通道**：`kickLocal`/`broadcastKick`/消费者。只管"把连接踢下线"，不做撤销 |
| `ban.ts` | 封号/强制下线**编排**：`account.ban()` → 踢在线 → 审计 |

`apps/server/src/websocket/push.ts` 的在线表是 **`uid → sessionId → {sink, kick, tokenHash}`**
（⛔ 不能一个 uid 只存一条：同 token 可开多条连接，单槽会导致 `/admin/kick` 回 `kicked:false` 假阴性）。

### WebPlatform（`apps/WebPlatform/src/`）

`lib/{auth,login,character,area,wxClient,mysql}.ts`（MySQL-only、**返回结果码**不抛业务错误）+ `index.ts`（Fastify，仅 split 用）。
端点清单见 [WEBPLATFORM.md §3](WEBPLATFORM.md)。

---

## 5. 🔴 硬约束（踩了就是**静默错误**，不是报错）

| # | 约束 | 机检 |
|---|---|---|
| 1 | **split 下 `platform/` 之外直调 `@game/webplatform/lib` = 打错库**（lib 被注入游戏服的池；账号表在账号库）⇒ `affectedRows=0`/空集，封号"成功"却没封、`ul` 永远空。唯一例外：`core/infra/mysql.ts` 的池注入 | `test/lib-import-ban.test.ts`（含相对路径绕过） |
| 2 | **踢人关闭码不得进 Colyseus 保留区**（`4000/4001/4002/4003/4010` + `4210–4217`）。曾误用 4001 ⇒ **每次优雅重启全服玩家看到「账号已被封禁」并被清 token** | `test/kick-close-code.test.ts` |
| 3 | 新增 key/常量/错误码**先进 [SERVER.md §13](SERVER.md) 契约表**再进代码（铁律 8） | 人工 + review |
| 4 | 端点全集 = shared 声明集合；`sId` per-zone 键必须在 `zoneCtx.run` 内 | `lobby-rpc-contract` / `zone-failfast` |

全部机检（`npm --workspace @game/server run test`）：
`compute-pool` `config-guard` `dir-import-ban` **`kick-close-code`** **`lib-import-ban`** `lobby-rpc-contract` `shared-logic` `zone-failfast`

---

## 6. 配置与 schema

| 环境变量 | 缺省 | 说明 |
|---|---|---|
| `ACCOUNT_MODE` | `in-process` | `http` = split。⚠ **模块加载期一次性求值**，⛔ 不支持运行期切换 |
| `WEBPLATFORM_BASE_URL` | `http://localhost:2570` | split 下 WebPlatform 地址（每请求现读） |
| `WEBPLATFORM_MYSQL_URL` | = `MYSQL_URL` | 账号库（dev 与游戏服共库；split 指向独立库） |
| `WEBPLATFORM_PORT` | `2570` | WebPlatform 监听端口 |
| `WEBPLATFORM_TRUST_PROXY` | `1`（**信**） | 置 `0` 才改用 socket 对端 `req.ip`。⚠ **缺省信不是疏忽**：本进程只在 split 起，而 split 的流量必经 LB ⇒ 不信 XFF 时所有玩家的 `req.ip` 都是 **LB 地址**，全服塌缩进同一个令牌桶（容量 5 / 补 0.2 每秒 = **全服 12 次登录/分钟**），既是开服即挂也正是 09·G5 禁的连坐。⚠ **伪造 XFF 的防护归 [W1](WEBPLATFORM.md)（鉴权 + 绑定内网），不归本开关**——别让人直连到即可。启动日志会打出当前用的是哪种身份来源 |
| `REDIS_COORD_URL` | = `REDIS_DURABLE_URL` | 踢人流所在实例（dev 复用 durable；prod 可物理隔离） |
| `ADMIN_API_SECRET` | 空 = **端点关闭** | `/admin/kick` 共享密钥（fail-closed） |
| `KICK_STREAM_TRIM_MS` | 24h | 踢人流 `XTRIM MINID` 窗 |

**schema 变更**：`accounts` 现列 = `user_id openid unionid status created_at last_login_at token_hash token_issued_at session_key nickname avatar_url phone`；
新增表 `char_registry(user_id, server_id, created_at)`。
⚠ 存量库若有 `token_epoch`/`token_issued_epoch`，是 M12d 简化后**永远为 0 的死列**，另出 DROP 迁移（`db-bootstrap` 不做破坏性操作）。

**怎么跑两形态**：

```bash
npm --workspace @game/server run stack && npm --workspace @game/server run db:bootstrap
```

- in-process：`npm run dev`（照旧，什么都不用配）
- split：另起一个终端 `npm --workspace @game/webplatform run start`，再以 `ACCOUNT_MODE=http npm run dev` 起游戏服

---

## 7. 待办账本（接手后的可选起点）

| # | 项 | 位置 | 备注 |
|---|---|---|---|
| **W1** | **WebPlatform 端点鉴权分层** | [WEBPLATFORM.md §4](WEBPLATFORM.md) | ⛔ 现状 `/ban`·`/revoke`·`/verify`·`/character/*`·`/account/exists` **全无鉴权**——能连到进程就能封任何人、遍历用户足迹。**上线前必修** |
| **W2** | split 下封号无审计行 | 同上 | `login_audit` 在账号库，但端点不写、组侧 `auditLogin` 写组库 |
| **W3/W4** | 补画像端点 / 目录接真实配置 | 同上 | `bindProfile`·`bindPhone`；`lib/area.ts` 目前是 demo 静态表 |
| **GM 工具** | 运营侧实现 | 规则 `09·G7b` + **[GM-TOOL-SPEC.md](GM-TOOL-SPEC.md)**（可直接交付运营） | 契约已定：先权威后踢、遍历全节点（⛔ 不走 LB）、重试到确认+告警、可观测"已封仍在线" |
| **U6** | 发奖边界 ban recheck | DUAL_MODE §2.4 | 结算当前只落证据、无发奖逻辑；发奖落地时必须加 |
| **archive 步** | `user_archive` 按区 + `active:lru`/freeze 区化 | DUAL_MODE 进度表 | ⛔ 补齐前不开「多区 + freeze」 |

---

## 8. ⚠ 已知且**刻意接受**的边界（请勿当 bug 反复"修"）

1. **缺 GM 踢则无自动收敛**：在场连接活到 `sess` TTL(3d)。这是取消 `verifiedAt` 周期回权威换来的——
   送达保证移交 GM 工具的 ack。已有特征化测试固化此行为。
2. **已在战斗房的被封玩家会把这局打完**：`GameRoom` 不参与在线表、入房后不做每消息复验。
   新战斗房进不去（onAuth 已改 strict）；钱的安全交给 U6 发奖 recheck。
3. **WebPlatform 刻意不持 coord Redis、不广播踢人**：fire-and-forget 广播本就不构成保证，
   两者并存只会让人误以为有保证（见 [WEBPLATFORM.md §5](WEBPLATFORM.md)）。
4. **`AUTH_EPOCH_STALE`** 保留为契约码但**服务端不再产出**（不 churn 客户端 union / 协议指纹）。
5. **`in-process` 的两个登录端点仍无条件采信 `X-Forwarded-For`**（`http/account/{wxLogin,devLogin}.ts`）。
   ⚠ 上面那条 `WEBPLATFORM_TRUST_PROXY` **只管 WebPlatform 独立进程**，⛔ 不要读成"XFF 已全局收口"——
   `ACCOUNT_MODE` 缺省就是 `in-process`，那两个端点才是开发/测试期真正对外的登录入口。
   **为什么没顺手照搬闸门**：Colyseus 的 `ctx` 拿不到 socket 对端（`@colyseus/better-call` 的
   node adapter 只把 method/body/headers 搬进新 `Request`，丢弃 `req.socket.remoteAddress`），
   所以"不信 XFF"时唯一能取的值是硬编码 `"0.0.0.0"` ⇒ 全部直连请求塌缩进一个桶。
   照搬闸门＝把这条变成默认行为，是拿一个洞换一个更确定的事故。**真正的修法**是先从 transport
   层把对端 IP 透传进来，或由 W1 把暴露面收掉。⛔ 在那之前别做"半个移植"。
6. **登录抢锁失败留下「权威已换发、组缓存未跟上」的分叉**（**仅 in-process**）。
   token 由 lib 在**进锁之前**签发落库，故 `finish()` 非输家路径上的任何抛错都留下：MySQL=新 hash
   （客户端只拿到 409 ⇒ 这个 token **没人持有**）、组 `sess`=旧 hash、审计已记一行登录**成功**。
   后果：旧端在场连接走快路径（纯缓存比对）**继续放行**，但新建连走 strict 比权威即被拒 ⇒
   「能玩到掉线为止，一掉线就登不回来」；且**没广播顶号踢**（踢在 `writeGroupSess` 里，没跑到）。
   **客户端重登即自愈。** 决策 = **可观测不改结构**：补一行 `login_diverged` 审计（线上可定位），
   ⛔ 不为此改 WebPlatform lib 的登录 API（把签发也拖进锁只利好 in-process，split 本无此分叉）。
   特征化测试：`test/int/auth.test.ts`「抢锁失败 → …login_diverged 审计」（含输家路径不记的反例）。
7. **登录会被 `freeze`/`thaw` 的长持锁打成硬 409**。09·L1 只允许一把 per-uid 锁，而两边预算不对称：
   freeze/thaw 开看门狗（`LOCK_RENEW_MS`）可按秒持有，登录只有 `LOCK_RETRY_MAX=3`、退避
   50/100/200 ≈ **350–500ms 封顶**。最可能的触发面是**冷号回归**（正在冻/解冻时在另一端顶号）。
   决策 = **维持现状 + 诚实告知**：⛔ 不给登录单独放宽预算、⛔ 不开第二把锁；客户端
   `LoginLogic` 自动退避重试**一次**（600ms）后如实报「系统繁忙，请稍后重试」——与「登录失败」
   分开，别让用户以为账号有问题。为此 `core/http.ts` 的非 2xx 改抛 `HttpError{status,code}`
   （此前状态码只在 message 字符串里，业务层无从判别）。机检：`test/pageLogic.test.ts`
   「BUSY …自动退避重试一次 + 文案区分」（含「⛔ 无界重试即红」与「非 BUSY 不重试」）。

---

## 9. 决策记录（为什么是现在这样）

沿途砍掉的设计，理由都记在 [DUAL_MODE.md §2.3](DUAL_MODE.md) 的「⚑ 最终定案」横幅下（横幅**以下**为历史推导，刻意保留以见演进）：

| 砍掉 | 为什么 |
|---|---|
| `token_epoch` fence | 真实撤销路径都置 `token_hash=NULL`，`verifyToken` 先命中 hash 判据 ⇒ epoch 分支几乎摸不到 |
| 本地 `maxEpoch` 快检 | 改「每节点自筛踢」后，踢与 maxEpoch 依赖同一条广播 ⇒ 只多兜几毫秒的在途 RPC |
| `revocation_log` outbox + relayer | 广播退为 best-effort 的"踢"通道后，"可证明零漏发"失去意义（真相在 `accounts`） |
| `verifiedAt` 周期回权威 | 送达保证改由 GM 工具承担；顺带省掉 split 下约 1.6k QPS 的常态回源 |

---

## 10. commit 索引（本弧，按时间序）

**M12c**：`81d415f` `4c14887` `118139a` `9a9c571` `830bbd3` `70ab107` `11c4603` `68613ba` `1d8397e`
`43dc91d` `47d5d8a` `31a791c` `d43e244` `2fc5643` `38077e6` `80bd270` `9cf10f2` `96882c8` `52e290b`

**M12d**：`da161be`(工厂) `0439bf1` `ecbf667` `31bebc8` `397b7e5` → `3c3fe49`(简化) `aa8f95b`(GM 端点)
`0dcc7a3`(顶号/三因) `b5afee1`(G7b) `ea31274`(门户专档) `5242413`(接缝 E2+机检) `d00a542`(split 收尾) `4df4041`(评审收口)

> ⚠ M12d 中段（`0439bf1`–`397b7e5`）建过 epoch/maxEpoch/outbox 的控制总线，随后在 `3c3fe49` 起被**刻意简化掉**。
> 读 commit 历史时请以 `4df4041` 的最终状态为准，中段仅供理解演进。

**对抗评审**：本弧共 4 轮多 agent 对抗评审（2f / 2g / M12d 核心 / M12d 全弧），确认项全部修复并补测。
最后一轮逮到 3 个 HIGH：关闭码撞 Colyseus 保留码、`GameRoom` 用快路径准入、顶号自踢 + 多连接抹除。
