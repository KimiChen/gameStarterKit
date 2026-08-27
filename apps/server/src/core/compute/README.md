# core/compute/ —— 请求型纯计算池

当前实现是一个惰性 `worker_threads` 池，只有 `tasks/battleSim.ts` 示例和单元测试；默认服务端业务没有
调用 `runInPool`。它展示扩展接缝，不表示项目已经接入通用任务系统。

适用判据：

- 玩家请求正在等待结果，且工作是循环上界明显超过单玩家配置上限的纯 CPU 计算，可以进入 `tasks/`。
- 小型校验和有界状态变更留在 handler。
- 周期任务、批处理、跨用户写和任何 IO 工作不进入本池；它们需要独立的领域编排。
- 无法说明复杂度上界时，先测量和拆分，不要在网关消息循环中直接执行。

任务约定：

- `tasks/<task>.ts` 默认导出纯函数；任务名等于文件名。
- 输入和输出必须能被 `structuredClone`；任务内禁止 Redis、MySQL、HTTP、文件 IO 和可见副作用。
- 排队与执行共用 `COMPUTE_TASK_TIMEOUT_MS`。执行超时会终止 worker 并补位，所以任务不能留下半成品。
- worker error/exit 会使在途任务失败，并在退避后补位；空闲 worker `unref()`。

用法：

```ts
const result = await runInPool<Input, Output>("battleSim", input);
```

queue 有 `COMPUTE_QUEUE_CAPACITY` 总 admission 上限（运行中和排队中的任务合计）；达到上限时以
`ComputeOverloadedError` fail-fast，调用方应退避或把任务转入独立批处理。每个任务仍有排队/执行共用
超时，避免 worker 启动失败时无限等待；测试覆盖 worker 池的并发和故障恢复，以及容量边界。

完整边界见 [`docs/SERVER.md §11`](../../../../../docs/SERVER.md#11-计算任务)。
