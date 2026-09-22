# 数据库基础设施

- 统一封装 MySQL、Redis 连接、缓存与固定服 Redis 键空间代理。
- 业务不可直接跨过此层建立无管理连接；连接初始化与停机释放由 `EngineInitHelper` 统筹。
