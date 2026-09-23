# Native kit 生命周期

`NativeKitLifecycle` 提供跨进程、跨 SID 的持久化写入屏障；部署范围是同一个 centerRedis。
`NativeKitCli` 复用正式配置解析和开发启动编译器，仅初始化 Redis，不启动玩家端点或 MySQL。

- `active`：正常写入。每个服务 worker 启动时登记 UUID 运行租约，10 秒有效、2 秒续约；正常停服释放，过期旧进程禁止重新登记。
- `draining`：正常写入关闭。只有持有同一 owner/epoch 的运维异步调用链可提交，60 秒运维租约和 Redis 时间参与最终 CAS。
- `drained`：业务待结算完成，存活房间保存原局后暂停；只允许显式恢复或开始代码替换。
- `detached`：安装器已经锁定代码替换，禁止恢复和启动。安装成功并生成注册表后回到 drained；卸载和失败保持 detached。

宿主管理键为 `nativeKit:lifecycle:v1`、`nativeKit:runtimes:v1`，数据结构均为公开 AtomicHash。
业务 kit 用构造器 write guard 把控制记录纳入每个写事务读集，资产写入和业务回执会共同回滚，不能只在 RPC 入口检查开关。
后台调度也检查 runnable；并发事务仍由 guard + CAS 作最终判定。维护权限通过 AsyncLocalStorage 限定，不能设置进程全局 bypass。

运维端口约定为 `src/modules/<kit>/api/lifecycle/NativeKitMaintenance.ts` 的 `NativeKitMaintenance` 导出，符合 `NativeKitMaintenancePort@1`。
普通 drain/resume/cancel 通过模块端口实现。detach/attach 和只读 snapshot 由宿主实现，因此卸载后的状态仍可检查。
安装器调用必须提供明确 `NATIVE_KIT_PROFILE`；当前自动流程不支持同一代码树同时服务多个不同 centerRedis 部署。

数据版本与 key 清单持久保留；未提供迁移器时禁止跨数据版本或删减旧 key，缺失模块文件不等于数据不存在。
`NativeKitSnapshot` 在 drained/detached 下按声明键扫描、排序并计算 SHA-256；前后控制版本变化会使审计失败。
扫描只用于离线运维，不在网关请求里运行；Redis HSCAN 的 COUNT 是提示，不能声称严格限制每页元素数。
