# engine 源码

- 这里是框架的 TypeScript 真源；包外消费者只能从根入口导入公开能力，避免绕过初始化和依赖边界。
- 业务扩展应接入既有 Action、Bean、任务和协议登记点，不把应用规则塞进基础设施层。
- 房间 Bean 直接复用 `ServerHash` 的 `getNotifyUids`；房间节点绑定接收者查询函数，不为同步范围新增 Bean 基类。
