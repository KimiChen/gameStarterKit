# 变更追踪与 Redis 持久化

- 实现 Bean、DiffArray、DiffMap 等数据结构的差分、序列化、加载和 Redis 提交。
- 这是框架内部实现面；业务从包入口消费稳定的 Hash/Bean/集合 API，不依赖深层文件或手工构造差分。
