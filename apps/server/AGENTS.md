## 适用范围

- 本文件约束 `apps/server`；默认只修改当前目录及其明确需要同步的生成物。
- `humanDocs/` 仅供人类阅读，AI 不读取、不搜索、不修改。
- 先看与改动目录最近的 `README.md`；没有时看 [AI-INDEX.md](AI-INDEX.md)。

## 统一规则

- 真源优先：不手改 `*.generated.ts`、镜像和由 codegen 维护的索引；改真源后运行对应 codegen。
- 共享协议、错误码、消息名、公式和配置从现有 shared/core 登记点导入，不复制定义。
- 新增功能优先沿现有 façade、loader、registry 和 descriptor 扩展，不绕过锁、fence、事务、validator 或生命周期。
- 保持相对导入无扩展名；保持 shared 零依赖；客户端代码不得导入服务端包。
- 改动后先做最小相关验证，再按需要扩大范围；不要用放宽类型检查或修改测试来绕过失败。
- 不提交当前工作区中与本轮无关的改动。

## 常用入口

- Lobby RPC：`src/websocket/README.md`
- HTTP：`src/http/README.md`
- 实时房间和玩法：`src/rooms/README.md`
- 数据、并发和基础设施：`src/core/README.md`
- 外部身份接缝：`src/platform/README.md`
- 生成器：`tools/*-codegen/README.md`

## 沟通

- 使用简体中文。
