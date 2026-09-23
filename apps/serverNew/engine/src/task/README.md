# 任务生命周期

-   定义 ServerTask、路由执行与附加任务，负责把请求包装进可提交、可收尾的执行阶段。
-   附加任务必须服从 Action 成功/失败语义；网络回复和同步只能在持久化成功后发出。
-   跨进程转发必须发生在 `ServerTask`、`actionBefore` 与 Bean 加载之前；`taskGroupId` 只选择 Task Worker，`bindId` 只选择进程内串行组，空 `bindId` 使用有效 `uid`。
