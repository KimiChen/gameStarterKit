# 框架开发

## Redis Bean 和 Ref

- 业务通过 engine 公开入口使用 `Hash`、`UserHash`、`HashJson`、`DiffArray`、`DiffMap` 和装饰器，不依赖 differ 深层文件。
- Redis Bean 的集合字段只能使用 `DiffArray` 或 `DiffMap` 支持的基础类型和 Bean；原生 Array/Map 不参与变更追踪和持久化合同。
- `OnlyNet` 仅同步网络，`OnlyRedis` 仅持久化，`Mod` 声明自动同步模块；修改用途会影响历史数据和客户端合同，必须同步验证生成记录。
- `loadOnlyRead` 返回的对象不可写；需要产生 Change 或持久化时使用正常 `load`，并在创建该 Bean 的 Action 上下文内完成修改。
- `loadOnlyRead` 的类型会禁止写业务字段、嵌套 Bean 和集合遍历回调；运行时也会拒绝 Bean、`DiffArray` 与 `DiffMap` 的写操作。需要编辑时重新使用普通 `load`，不要通过类型断言绕过限制。
- `HashJson.load*` 不修改传入的 id 列表；单条加载缺失时统一返回 `undefined`，空 id 列表只用于显式的 `loadAll` / `loadOnlyReadAll`。
- `RefHash` 使用 `FromData(SourceClass, 'field.path')` 的类型化字符串路径；不要恢复已删除的 `Class.f_*` 字段引用方式。

## Change 和持久化

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
