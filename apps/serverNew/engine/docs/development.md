# 框架开发

## 新增业务 API 的固定动线

一条 Lobby API 只需要四步，⛔ 不需要新增 Route 文件、Store 或启动注册代码。

1. **schema 声明**：在 `apps/shared/schema/protocols/C2S/<域>.json` 里加 route 与请求/响应类型
   （schema v1：语言即数据）。改了类型或字段要同批递增该域的 `contractVersion`。
2. **生成**：在 `server/` 先运行 `pnpm gen:kit-protocol`，把 schema 生成到 shared 的域文件和路由登记；
   再运行 `pnpm generate`（`gen:lobby-contract` → Bean/协议生成器 → `gen:modules` → `gen:error-codes`）。
   两步共同产出 Req/Res、validator、`serviceProto`、`Actions`，以及 `generated/lobby-contract/` 下的域产物。
   ⛔ `generated/` 全是产物，不得手改；`generated/records/record.json` 原地推进，⛔ 不得删除重建。
3. **Action**：在 `src/modules/<模块>/action/Action<域><动作>.ts` 里继承 `ActionUser`，只做业务规则。
   协议真源是 schema，⛔ 不要再往 `src/modules/*/*C2S.ts` 手写协议声明 —— 生成器已不发现它们
   （只保留 `src/runtime/protocol/C2S/` 这组框架级兼容锚点，由 `proto.json5` 与兼容基线钉住）。
   需要进入 Task Worker 或改变默认玩家串行组时，按下文“Action 进程与串行声明”显式实现两个方法。
4. **Bean**：在 `User`（或对应模块 Bean）上加字段。默认 `SaveType.All` 即同时落 Redis 与上网；
   只服务服务端时序的内部字段用 `@OnlyRedis`（`SaveType.ForRedis`），它们**不会**出现在同步载荷里。

提交与同步都由框架自动完成：`RedisTask` 落盘 → `ModSync` 组装变更 → `SyncReceiptTask` 把差异
登记到当前请求的 `reply.sync`，并投递给其他在线用户。⛔ 不要在 Action 里手工推变更、手工写
Redis，或自己拼一份增量数据。

结构门禁：`pnpm test:suite -- structure`（schema/shared registry/生成物三方一致、手工路由不得
复活、普通 Action 不得直接 `import RedisInstance`、`@OnlyRedis` 字段不得上网）。

## Redis Bean 和 Ref

- 业务通过 engine 公开入口使用 `Hash`、`UserHash`、`HashJson`、`DiffArray`、`DiffMap` 和装饰器，不依赖 differ 深层文件。
- Redis Bean 的集合字段只能使用 `DiffArray` 或 `DiffMap` 支持的基础类型和 Bean；原生 Array/Map 不参与变更追踪和持久化合同。
- `OnlyNet` 仅同步网络，`OnlyRedis` 仅持久化，`Mod` 声明自动同步模块；修改用途会影响历史数据和客户端合同，必须同步验证生成记录。
- `loadOnlyRead` 返回的对象不可写；需要产生 Change 或持久化时使用正常 `load`，并在创建该 Bean 的 Action 上下文内完成修改。
- `loadOnlyRead` 的类型会禁止写业务字段、嵌套 Bean 和集合遍历回调；运行时也会拒绝 Bean、`DiffArray` 与 `DiffMap` 的写操作。需要编辑时重新使用普通 `load`，不要通过类型断言绕过限制。
- `HashJson.load*` 不修改传入的 id 列表；单条加载缺失时统一返回 `undefined`，空 id 列表只用于显式的 `loadAll` / `loadOnlyReadAll`。
- `RefHash` 使用 `FromData(SourceClass, 'field.path')` 的类型化字符串路径；不要恢复已删除的 `Class.f_*` 字段引用方式。

## Change 和持久化

- 跨实体条件提交使用公开 `AtomicHash<T>` / `AtomicHashTransaction.run`：一次提交内校验全部已读字段，再写余额、领域状态和持久业务回执。封装保留既有 hash 标量/JSON 编码；不会隐式变更 Bean 格式。
- 原子 Hash 与 RootBean 不得共写同一字段，也不得把显式原子提交与稍后 Bean 保存当作一笔事务。只读结果深冻结；写入必须通过事务。成功返回表示提交已完成，之后才能登记 sync 或回复。
- 事务回调冲突时会重跑，只能访问本事务结构并计算结果；ID、随机种子和普通业务时间在回调外固定。活动截止等需要提交时有效的条件，使用 `await tx.time(hash)` 获取同 Redis 权威毫秒时间，并调用 `tx.validBefore(deadlineMs)`；提交在截止时或之后到达会重跑回调，重新判定资格，不能沿用过期判断。禁止在回调内发送事件、网络请求、修改 Bean 或发布通知。网络错误不自动重试，必须以相同领域操作 ID 恢复已持久化结果。
- 独占实体使用公开 `AtomicLease` 持久代次与 Redis 时钟；必须在每次受保护写入的同一事务调用 `assert(tx, token)`，不能只在进房时校验。过期续租产生新代次；释放保留代次，迟到旧所有者不能写入或释放新租约。
- `OwnedRoom` 提供每房独立 FIFO、恢复快照和有界订阅集合；网络发送放在变更队列之外。FIFO 只控制本进程顺序，不能代替事务里的租约校验。跨进程恢复必须从权威结构重建，不能用缓存重置状态。
- 原子提交限单 Redis 实例、256 个字段、1 MiB；跨 Redis 和无界批量任务必须拆为带持久进度的步骤。当前基于独立 Redis，不声明 Redis Cluster 跨槽事务支持。

- Bean setter、`DiffArray` 和 `DiffMap` 变更由当前上下文收集；不要手工拼接能够由 `toModData` 表达的增量数据。
- `getNotifyUids()` 决定 Change 接收者；`UserHash` 默认通知自身，跨玩家模块必须明确返回稳定接收者集合。
- 业务数据默认落 Redis：玩家档由 `Hash` / `UserHash` / `HashJson` 承载，随 Action 提交写回。MySQL 只用于账号映射与运营/配置面，⛔ 不要为玩家业务字段新建表或 typeorm 实体。
- `RedisTask` 只在 Action 成功阶段调用 `RedisService.save()`；错误阶段没有通用回滚，跨 Redis、数据库或外部系统写入必须由业务设计幂等和补偿。
- 所有触碰 Bean 或上下文的 Promise 都必须在 Action 生命周期内等待完成；上下文结束后的写入会被拒绝或产生不可追踪状态。
- Action 的成功响应和 Change 推送只会在 Redis 保存成功后发送；保存失败会返回错误，业务不应在 Action 内自行提前通知客户端成功。

## Action 和本地调用

- `IActionLogic<Req, Res>` 可以为独立 Action 显式声明请求和响应；不要用 `any` 传播业务数据类型。
- `AsyncReturn` 是可判别联合：先判断 `isSucc`，成功分支读取 `res`，失败分支读取 `errMsg` 或错误对象。
- `MessageHelper.syncDoFunc` 接受同步或异步函数，并在完整 Action 上下文内等待其结束；脱离上下文的业务写入必须通过此类入口安排。

### Action 进程与串行声明

`getTaskGroupId` 与 `getBindId` 在 `ServerTask`、`actionBefore` 和 Bean 加载之前依次执行。前者只选择
执行进程，后者只选择该进程内的串行队列：

| 业务所有权 | `getTaskGroupId` | `getBindId` |
| --- | --- | --- |
| 玩家 Bean | 不实现，或返回 `undefined` / `null` / `-1` | 不实现，默认使用可信 `uid` |
| 公会、房间等非玩家资源 | 返回稳定资源分片 ID | 返回稳定资源 ID |
| 同一 Task Worker 上的多个独立资源 | 返回相同分片 ID | 各自返回资源 ID |

- `taskGroupId` 为非负整数时，目标槽位是 `workerNum + taskGroupId % taskWorkerNum`；`0` 是有效值。
- `bindId` 的 `0` 也是有效串行组；空值回退有效 `uid`，没有有效 `uid` 时不分组。
- 同一份可写资源的所有入口必须返回相同的 `taskGroupId` 和 `bindId`，否则无法保证跨请求串行。
- 两个方法只能读取可信身份、已校验请求或只读索引；不要加载或修改业务 Bean，也不要执行每日重置等业务逻辑。
- Task Worker 不得提交玩家 Bean。一个基类同时承载玩家写入和公共资源写入时，由具体 Action 声明调度，避免在基类统一转去 Task Worker。
- 跨进程请求会透传首次解析结果；目标进程及其同步嵌套调用不得重新计算。

```ts
export class ActionGuildResetGift extends ActionGuild {
    async getTaskGroupId(call: ApiCall<ReqGuildResetGift>): Promise<number> {
        return call.req.guildId
    }

    async getBindId(call: ApiCall<ReqGuildResetGift>): Promise<number> {
        return call.req.guildId
    }
}
```

## 事件

- `await EventSystem.publish()` 会等待所有同步处理器；`isSync = false` 的处理器必须在 Action 上下文发布，归属该上下文并仅在 Redis 提交成功后的 `triggerAsync()` 中执行一次。失败 Action 的延后事件会随上下文丢弃。
- `EventCalculate` 的 `preHandler` 在发布时聚合，`handler` 在 `handlerCalculate()` 中提交；两者都需要有效的 Action 上下文。
- 同步处理器的异常会使当前 Action 失败；Redis 提交后的延后处理器、RPC、遥测等收尾任务的异常只记录错误并继续处理，不会改变已提交 Action 的响应。

## 定时与延迟任务

- `CronService.initTask` 使用包含秒的六字段表达式；任务名在进程内必须唯一，并通过 center Redis 记录上次执行时间和分布式锁防重。
- service 中 Cron 回调会通过 `MessageHelper.syncDoFunc` 进入任务上下文，API 进程直接执行；回调必须等待所有异步业务完成。
- 需要重启后保留的固定服延迟业务使用 server 的 `QueuedLocalAction`，并明确目标 `sid`；不要用进程内 timer 替代 Redis 队列。

## 日志

- 日志实现基于 Winston，配置由加载后的有效 `platform.log` 提供；不要另建业务日志框架。
- `Log.<channel>` 的通道名必须同时存在于公开 `LogChannels` 类型和运行配置；缺失通道默认回退到 default，严格场景可设置 `absentUseDefault=false` 使其失败。
- 文件通道自动写入区服目录，业务进程不得按 PID 改写目录；新增通道时同时验证 console/file、等级、轮换和时区行为。

## 测试边界

- engine 的类型只从包入口验证；公开入口缺失时先修正导出，不在测试中改用深层 import。
- `test/engine/net/client.test.ts` 是依赖真实 center、固定服、测试账号和当前业务协议的联调脚本，不是可脱离环境运行的单元测试，也不依赖 IDE 扩展发现。
- 网络、Redis、Cron 或日志改动应优先运行对应源码测试，再执行 engine 类型检查和构建；不要把一次性测试步骤写入子目录 README。
- 修改上述业务契约后运行 `pnpm test:contracts`；它不依赖 Redis、MySQL 或已启动服务。

### 原子结构的维护写入守卫

`AtomicHash`、`AtomicOperation`、`AtomicLease` 可传入异步 write guard。守卫在事务 set/delete 时执行，必须把租约或维护状态纳入相同 AtomicHashTransaction 的读集；仅在请求入口读开关无法阻止已开始事务的旧结果提交。
守卫抛错或状态竞争时，事务内其它未带守卫的资产修改也不能单独提交。维护权限应由宿主在独立异步上下文中授予。
`AtomicHash.scan(cursor,count)` 供离线运维游标枚举，返回值仍经过 codec 验证和只读冻结；COUNT 不是严格页容量保证，不能用于宣称网关请求有严格扫描预算。
