# engine

## 运行约束

- 外部项目和独立测试必须从包公开入口导入运行时类型；不要执行 `src` 或 `dist` 深层模块，以免绕过入口初始化并引入循环依赖。
- 客户端入口**只有**原生 WebSocket Lobby（`net/lobby/LobbyServer` + 字符串路由）；旧二进制网关（`ClientServer`/`ClientCodec`/`ProtocolCodec`/数字协议号）与 PB 编解码已删除，⛔ 不要以「兼容旧客户端」为名重建。内部 HTTP 使用独立端口，不得绑定客户端端口。
- 游戏进程按 `--sid N` 固定承载一个区服；精确 `sN.json5` 缺失时，端口和 `serverRedis.database` 都从基础配置的一号值按 `sid` 递增，存在时可独立覆盖端点并局部覆盖 `serverRedis`。
- 线路配置只读取精确的 `<platform><version>` 目录，且 `platform.json5` 只做顶层浅覆盖；目录或文件缺失时使用项目基础配置，禁止自动创建线路目录或回退到其他线路。
- 协议路由只以字符串标识（`ProtocolDef = { type, name, serviceType? }`）；`ProtocolConfig.protocols` 不含数字协议号、schema id 或内联 schema，⛔ 不要为了「兼容旧客户端」把它们加回来。
- 多进程重复登录必须原子替换 Redis 在线归属后再踢旧连接；断线清理只能处理「被释放的连接仍是该 uid/sId 当前连接」的那一次（原生 Lobby 由 `LobbyAuthProvider.releaseOnline` 判定），避免旧连接异步 close 抹掉新会话。
- 入口 Worker 先解析 `taskGroupId` 与 `bindId`：前者为空或 `-1` 时留在普通 Worker，非负整数按 Task Worker 数取余；后者为空时回退有效 `uid`，只负责目标进程内串行。跨进程调用链必须透传并复用两项结果，不得在目标进程重算。
- 玩家 Bean 的唯一写入 Owner 是 `uid` 对应的 Event Worker；客户端请求与后台 LocalAction 都必须回到该 Worker 串行执行。Task Worker 只能计算或发送玩家事件，不得直接提交玩家 Bean。
- 客户端和内部业务 Action 都从进程内注册表执行；协议 Service 名不是远程路由依据，不要重新引入网关、服务发现或跨进程 Action 路由。
- `/internal/action` 中会读写 Bean 的处理必须通过 `MessageHelper.syncDoFunc` 进入 `ServerTask`，不得在裸 HTTP 回调中执行协议逻辑。
- service 停机必须在网络 drain 后调用 `EngineInitHelper.stopInfrastructure()`，释放 DB/Redis 连接；仅关闭监听端口不能保证单进程退出。
- Redis 调试连接必须由 `adjustRedis.connections` 显式开放，并经过 `redisPolicy` 分类、限流和脱敏审计。

## 依赖约束

- engine 的 `pnpm-lock.yaml` 仍是 v6，使用 pnpm 8 维护；不要用 server 的 pnpm 10 强制重建 engine 锁文件。
- `@arthropoda/typeorm` 使用 `vendor/arthropoda-typeorm-0.3.22.tgz` 内嵌制品；安装和更新锁文件不得改回远程 registry 版本。
- 仓库不提交项目级 `.npmrc`、私有 registry 或内网配置中心地址；依赖安装使用开发机或 CI 的标准包管理器配置。
- 框架能力、Redis Bean、Change、定时和日志的开发约束统一维护在 `docs/development.md`，README 不重复普通构建和测试命令。

## 验证约束

- 只读契约必须同时验证类型拒绝和运行时拒绝，并覆盖集合遍历回调、嵌套值及批量修改入口；只验证直接 setter 不足以证明只读。
- 延后事件必须验证并发 Action、嵌套调用及失败 Action 后的下一次请求，确保处理器使用发布者的上下文；提交后回调的异常应单独验证，不能用提交失败测试替代。
- 新传输适配必须复用 Action 调度、事件和已登记的附加任务；不得通过跳过生命周期来解除编解码依赖。内部身份必须由可信映射传入，不能以零身份运行玩家写操作。
- Bean 字段编号及其持久化别名独立于网络编码；调整协议时保留 ClassInfo 的字段/别名映射与记录，不恢复运行时 PB schema 初始化。
