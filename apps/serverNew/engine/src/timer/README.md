# 定时任务

- 提供进程内 tick 辅助与基于 center Redis 防重的 Cron 服务。
- 可重启后保留的固定服延迟业务应使用业务侧 Redis 队列；不要把它降级为不可恢复的进程内 timer。
