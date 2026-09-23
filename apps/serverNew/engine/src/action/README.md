# Action 调度

- 定义本地 Action 的调用契约、注册表和执行外壳，是玩家请求及内部业务写入进入生命周期的统一入口。
- Action 只编排业务规则；上下文、持久化、同步和附加任务由调度链协作完成，禁止另起绕过生命周期的写路径。
- 玩家 Action 通常不声明调度；空 `taskGroupId` 留在普通 Worker，空 `bindId` 默认按可信 `uid` 串行。
- 非玩家资源由具体 Action 分别声明 `taskGroupId` 和 `bindId`；不要在同时服务玩家写入的共享基类上统一转去 Task Worker。
