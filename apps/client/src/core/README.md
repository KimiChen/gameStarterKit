# core/ —— 客户端底层桥（日常不动）

宿主环境差异与通用基础设施集中在本目录；业务层不得散落环境判断。

- `http.ts`：XHR 请求底座、token 存取，以及两类明确 origin；`request` 使用当前游戏服 HTTP origin，
  `portalRequest` 使用外部 WebPlatform Public origin。业务调用面在 `net/http/`。
- `devEnv.ts`：`sync:client` 根据根 `.env.development` 生成的本地游戏服地址；属于生成物，禁止手改。
- `wechat-compat.ts`：由 `Main.ts` 提前装配、仅在 Cocos `MINIGAME` 环境实际打补丁的微信兼容层。
  它属于 `docs/EXTRAFEATURES.md` 记录的额外功能，不是通用渠道 SDK 能力。

环境兼容初始化必须早于相关第三方库使用，并保持集中、可测试。新增宿主差异通过独立 adapter 扩展，
不要把平台判断散落到 Logic 或业务调用中。
