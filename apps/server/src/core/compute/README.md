# core/compute/ —— worker_threads 计算池（铁律 11 的卸载点）

**何时进来**（判据看循环上界，四类关键词：结算模拟 / 全量重算 / 批量发放 / 离线补算）：

- 循环上界 = 单玩家资产级（背包/阵容/建筑，有配置上限）→ 在 handler 内联，不进来；
- 循环上界明显超过单玩家配置上限 → 请求触发的纯计算进入 `tasks/`；批处理不进入请求 handler。
- 说不清上界 → 按卸载处理。写错位置会被本地 `[rpc-budget]` 诊断提示指出。

**任务约定**：`tasks/<任务>.ts` default 导出纯函数（任务名 = 文件名，与 websocket loader
同一「路径即名字」哲学）；输入/输出可 structuredClone 序列化；⛔ 任务内禁 IO——要 IO
说明不是纯计算，回主循环编排。超时（COMPUTE_TASK_TIMEOUT_MS）会终止 worker 弃车换新，
所以任务必须无副作用。

**端点用法**：`const r = await runInPool<TIn, TOut>("battleSim", input);` —— 主循环只等待，不阻塞。
