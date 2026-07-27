# GM 工具实现规格：封号 / 撤销会话 / 踢在线

> 面向运营后台、GM CLI 与部署平台实现者。账号权威只在独立 `gono-webplatform`，游戏节点只持在线连接。
> 对应边界见 [WEBPLATFORM.md](WEBPLATFORM.md)，游戏服规则见
> [SERVER.md](SERVER.md)。本工具必须完成“写权威 + 逐节点踢在线”，任何一步都不能假装成功。

## 1. 两步 SOP（顺序不可颠倒）

```text
① 写账号权威
   POST {WebPlatform Admin}/v1/admin/accounts/{userId}/ban
   或
   POST {WebPlatform Admin}/v1/admin/accounts/{userId}/revoke

   成功后：
   - ban：账号状态封禁 + 全部区权威 session 作废 + Admin 审计
   - revoke：全部区权威 session 作废 + Admin 审计，账号仍可重新登录

② 踢既有在线连接
   对每一个在役游戏节点逐个直连：
   POST {node}/admin/kick
   汇总每个节点的 HTTP 结果；所有在役节点均确认 200 才算送达完成
```

为什么必须先 ①：先踢后写权威会让玩家立即重新登录。为什么 ① 后仍要 ②：Lobby RPC 快路径只校验
游戏组缓存，不逐消息回查 WebPlatform；已建立连接不会因为账号库变化自行消失。

`kicked:false` 表示“本节点没有该玩家”，是绝大多数节点的正常响应。成功标准是**所有在役节点可达并
返回 HTTP 200**，不是“至少有一个 `kicked:true`”。

## 2. 第一步：WebPlatform Admin HTTP

### 2.1 请求

封号：

```http
POST /v1/admin/accounts/u_123/ban
x-admin-secret: <WEBPLATFORM_ADMIN_SECRET>
x-operator-id: ops-alice
content-type: application/json

{
  "operationId": "gm-20260727-000001",
  "reason": "外挂"
}
```

仅撤销会话：

```http
POST /v1/admin/accounts/u_123/revoke
```

请求头和 body 形状与 ban 相同。`userId` 在路径中，操作者只从经过鉴权的
`x-operator-id` 取得，⛔ 不允许 body 覆盖。

### 2.2 响应

```json
{ "accountExists": true, "status": "banned" }
```

`status` 只允许：

- `banned`：封号事务成功；
- `revoked`：撤销事务成功；
- `not_found`：账号不存在，`accountExists=false`。

账号不存在是 HTTP 200 的业务结果。Admin 事务已包含 session 作废与审计，GM 工具不得直连账号库补写。

### 2.3 幂等与重试

`operationId` 必填且由 GM 工具生成：

- 同一操作号、同一账号、同一动作的重放返回首次结果；
- 同一操作号用于不同账号或不同动作，返回 `409 OPERATION_CONFLICT`；
- 超时、连接断开或 5xx 时，使用**相同 operationId**有限重试，不能生成新号猜测第一次没提交；
- 401/403 是密钥或权限配置错误，409 是调用方幂等键冲突，均应立即失败并告警；
- `not_found` 应向操作者明确显示，通常无需执行第二步。

## 3. 第二步：逐游戏节点 `POST /admin/kick`

### 3.1 契约

```http
POST /admin/kick
x-admin-secret: <GAME_NODE_ADMIN_API_SECRET>
content-type: application/json

{ "uid": "u_123", "reason": "banned" }
```

| 项 | 约束 |
|---|---|
| `uid` | 1–32 字符 |
| `reason` | `banned` 或 `revoked`；省略时为 `banned` |
| `200 {"kicked":true}` | 本节点命中至少一条连接并已踢 |
| `200 {"kicked":false}` | 本节点没有该账号，正常 |
| `401` | 游戏节点密钥错误，或节点未配置密钥而关闭端点 |
| `400` | 参数不合法 |

踢人时节点先推 `auth.forceLogout{reason}`，再用对应语义化关闭码关闭本节点该 uid 的全部区连接。
接口幂等；重复踢已离线玩家只会得到 `kicked:false`。

WebPlatform Admin 密钥与游戏节点 `ADMIN_API_SECRET` 是**两套不同 secret**，即使请求头同名也不得共用。

### 3.2 节点清单

⛔ **绝不能通过负载均衡器调用 `/admin/kick`。** LB 只会选一个后端，
`kicked:false` 无法证明其他节点无人在线。

工具必须从可刷新的权威来源取得全部在役节点内网地址，例如：

- Kubernetes `EndpointSlice`；
- Nomad/Consul 等服务发现；
- CMDB/部署清单；
- 过渡期由部署流水线生成的静态节点文件。

节点已确认退出服务时，其连接已经消失，可以跳过。真正危险的是节点仍在承载玩家，但因为清单过期、
网络策略或分区而不可达；这种情况必须判为部分失败并告警。

## 4. 参考编排

```pseudo
function applyAccountAction(userId, action, reason, operator):
    operationId = durableOperationId()

    # ① 写权威；网络不确定时复用同一 operationId
    admin = retryIdempotent:
        POST webplatformAdmin
             + "/v1/admin/accounts/" + userId + "/" + action
        headers = {
            "x-admin-secret": WEBPLATFORM_ADMIN_SECRET,
            "x-operator-id": operator
        }
        body = {operationId, reason}

    if admin.status in [401, 403, 409]:
        alert("ACCOUNT_ADMIN_REJECTED", userId, operationId)
        fail
    if admin.http != 200:
        alert("ACCOUNT_ADMIN_FAILED", userId, operationId)
        fail
    if admin.body.accountExists == false:
        record("NOT_FOUND", userId, operationId)
        return NOT_FOUND

    # ② 逐节点确认，⛔ 不走 LB
    nodes = refreshServingNodeList()
    if nodes is empty:
        alert("KICK_NODE_LIST_EMPTY", userId, operationId)
        return PARTIAL

    unreachable = []
    kickedNodes = []
    for node in nodes:
        result = retryFinite:
            POST node + "/admin/kick"
            headers = {"x-admin-secret": GAME_NODE_SECRET}
            body = {uid: userId, reason: action == "ban" ? "banned" : "revoked"}
        if result.http == 200:
            if result.body.kicked: kickedNodes.append(node)
        else:
            unreachable.append(node)

    record(operator, userId, action, operationId, nodes, kickedNodes, unreachable)
    if unreachable not empty:
        alert("ACCOUNT_KICK_INCOMPLETE", userId, operationId, unreachable)
        return PARTIAL
    return OK   # kickedNodes 为空也可以是成功：玩家本来就离线
```

第二步失败后**不要重新执行一个新 Admin 操作**。保留原 operationId 和第一步结果，针对未确认节点继续补踢；
必要时重放第一步也必须复用同一 operationId。

## 5. 可观测与告警

工具侧至少记录：

- operator、userId、动作、reason、operationId、requestId；
- WebPlatform Admin 的 HTTP/业务结果；
- 本次节点清单快照；
- 每节点耗时、HTTP 状态、`kicked`、重试次数；
- 最终状态 `OK|NOT_FOUND|PARTIAL|FAILED`。

硬告警：

| 告警 | 条件 |
|---|---|
| `ACCOUNT_ADMIN_FAILED` | 权威写入最终失败或响应契约异常 |
| `ACCOUNT_ADMIN_REJECTED` | 401/403/409 |
| `KICK_NODE_LIST_EMPTY` | 无法取得在役节点，⛔ 不能解释成“无人在线” |
| `ACCOUNT_KICK_INCOMPLETE` | 至少一个仍在役节点未确认 200 |

WebPlatform 会持久化 Admin 审计，但 GM 工具仍应保存编排审计：它是唯一能说明第二步遍历范围和送达结果的记录。
批量操作按“账号数 × 节点数”限速，避免 GM 流量冲击游戏网关。

## 6. 反模式

| ⛔ 做法 | 后果 |
|---|---|
| 只调 Admin ban/revoke | 已建立连接继续使用组缓存 |
| 先踢后写权威 | 玩家可立即重新登录 |
| GM 直写账号库 | 绕过事务、Admin 审计和幂等 |
| 通过 LB 调 `/admin/kick` | 只触达一个随机节点 |
| 把 `kicked:false` 当失败 | 正常离线/未命中产生无限重试 |
| 至少一个节点 `kicked:true` 就判成功 | 其他节点可能仍有连接 |
| Admin 超时后换 operationId | 第一次可能已提交，造成两条管理操作 |
| ban 后给节点传 `revoked` | 客户端提示和关闭语义错误 |
| Internal 与 Admin/节点密钥共用 | 扩大单一密钥泄漏的权限半径 |
| 依赖游戏内部广播兜底 | 广播无逐节点 ack，不构成送达证明 |

## 7. 验收清单

- [ ] 封在线玩家：Admin 返回 `banned`，全部节点确认 200，命中节点 `kicked:true`，客户端显示封禁原因。
- [ ] 被封玩家重新登录、重新进大厅或战斗房均被拒。
- [ ] revoke 在线玩家：被踢后能重新登录，客户端显示强制下线而非封禁。
- [ ] 离线玩家：所有节点 `kicked:false`，最终仍为 `OK`。
- [ ] 不存在账号：Admin 返回 `not_found`，工具明确展示且不误报系统故障。
- [ ] 同一 operationId 重放：返回首次结果；不同动作/账号复用得到 409 并告警。
- [ ] 模拟 Admin 超时但事务已提交：同 operationId 重试不产生第二条动作。
- [ ] 多节点环境中玩家只在 B：A/C false、B true，最终成功。
- [ ] 一个在役节点不可达：最终 `PARTIAL` + `ACCOUNT_KICK_INCOMPLETE`，不谎报成功。
- [ ] 节点清单为空：失败告警，不判“踢干净”。
- [ ] 两类密钥错误分别得到 401/403，工具不做无意义重试。
- [ ] 批量操作限速有效，游戏网关延迟无明显抖动。

## 8. 已知边界

- 游戏节点没有全局“查某人在哪个节点在线”的权威接口；逐节点 kick 的 ack 集合就是当前送达证明。
- 已进入战斗房的连接是否立即被节点在线表覆盖，以游戏服当前在线表范围为准；高价值发奖边界仍应再次
  校验账号状态。
- WebPlatform 不直接访问游戏节点，也不持节点清单；第二步的完整性归 GM/部署平台。
