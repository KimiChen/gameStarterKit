# 区上下文开发规则索引

> 文件名为兼容现有源码注释中的历史锚点而保留。本文只索引当前仍有效的代码正确性规则；
> 项目范围见 [根 README](../README.md#项目边界)。

## 2.3 会话事件

会话事件只负责让客户端重新读取权威状态。当前开发约束见 [SERVER §10](SERVER.md#10-广播与事件)。

## 2.6 角色存在性

账号、角色存在性与玩法档案的边界见 [SERVER §3](SERVER.md#3-数据边界) 和
[WEBPLATFORM §2](WEBPLATFORM.md#2-数据所有权)。

## 2.7 角色登记接缝

角色登记只能通过外部 HTTP 契约，失败语义见 [WEBPLATFORM §6](WEBPLATFORM.md#6-服务端边界)。

## 3.3 MySQL 区谓词

所有按区数据的查询与唯一键显式携带 `server_id`，见 [SERVER §12 DB](SERVER.md#db--mysql)。

## 3.4 幂等 ID

`op_id` 的派生输入包含区号、用户与业务域，见 [SERVER §12 I](SERVER.md#i--幂等)。

## 3.5 区上下文

入口使用 `zoneCtx.run` 建立上下文；Redis key 只由 `keys.ts` 构造，见
[SERVER §3](SERVER.md#3-数据边界) 与 [SERVER §12 R](SERVER.md#r--redis)。

## 3.6 无请求上下文的数据处理

后台处理样例从数据行携带的 `server_id` 重建区上下文，不依赖调用栈残留状态。

## 4.1 GameRoom 区隔离

房间以经过校验的 `sId` 作为房级常量，并在 join 时复核，见 [SERVER §5](SERVER.md#5-gameroom)。

## 4.2 协调数据

协调类数据与玩家权威档案使用不同 key 和客户端，不能互相替代。

## 4.3 进房校验

客户端传入的 `sId` 只作为请求参数，服务端必须按认证结果和本地配置复核。

## 4.5 Stream consumer

consumer 使用独立游标，逐条等待 handler，并通过稳定 ID 保持重复处理可收敛。

## 5.1 配置登记

区号与 key 规则的真源分别是 `core/infra/config.ts` 和 `core/infra/keys.ts`；新增字段先更新
[SERVER §13](SERVER.md#13-登记点)。

## Archive

freeze/thaw 仍是实验性开发模块，约束见 [SERVER §9](SERVER.md#9-实验性冷档模块)。
