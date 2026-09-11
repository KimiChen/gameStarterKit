# gameKit1：统一游戏框架设计导航

> 原 930 行蓝图已按目标与运行职责迁入 `docs/server/`，更新于 2026-09-11。本文件保留旧链接入口，后续内容在专题文档维护。

**从 [面向 AI 开发的最小游戏服务端框架](docs/server/README.md) 开始阅读。** 游戏进程只保留必要核心及所选业务，监控、部署、后台、备份和 AI 工具独立运行；目标、功能、运行位置和验收方式在新入口逐项对应。

| 阅读目的 | 文档 |
|---|---|
| 目标、最小核心与运行边界 | [主设计](docs/server/README.md) |
| 核心、进程与外围系统 | [核心](docs/server/core.md) · [进程与状态](docs/server/runtime.md) · [独立配套](docs/server/platform.md) |
| 按需业务、房间与客户端 | [扩展能力](docs/server/extensions.md) |
| AI 开发、手写代码与验收 | [开发与验证](docs/server/ai-validation.md) |
| 17 条原则、八层设计及参考来源 | [原则](docs/server/principles.md) · [参考](docs/server/references.md) |
| 全部 30 模块、251 子功能的目标与归属 | [模块归属表](docs/server/catalog.md) |

这是目标蓝图，不是完成清单；当前实现与约束见 [服务端开发说明](docs/SERVER.md)，实施状态仍见 [plan-v5](docs/plan-v5.md)。本轮只重组本地设计文档，未同步修改飞书。

## 原模块链接

| 原模块 | 新位置 |
|---|---|
| <a id="m01"></a>01 应用组装与模块管理 | [功能明细](docs/server/core.md#m01) |
| <a id="m02"></a>02 账号、登录与会话 | [功能明细](docs/server/platform.md#m02) |
| <a id="m03"></a>03 区服与入口管理 | [功能明细](docs/server/platform.md#m03) |
| <a id="m04"></a>04 网络连接与请求入口 | [功能明细](docs/server/core.md#m04) |
| <a id="m05"></a>05 协议与版本契约 | [功能明细](docs/server/core.md#m05) |
| <a id="m06"></a>06 玩家存档与数据模型 | [功能明细](docs/server/core.md#m06) |
| <a id="m07"></a>07 安全提交与防重复执行 | [功能明细](docs/server/core.md#m07) |
| <a id="m08"></a>08 客户端状态自动同步 | [功能明细](docs/server/core.md#m08) |
| <a id="m09"></a>09 钱包、货币与经济账本 | [功能明细](docs/server/extensions.md#m09) |
| <a id="m10"></a>10 道具、背包与通用奖励 | [功能明细](docs/server/extensions.md#m10) |
| <a id="m11"></a>11 商城、订单与支付 | [功能明细](docs/server/extensions.md#m11) |
| <a id="m12"></a>12 邮件、公告与消息通知 | [功能明细](docs/server/extensions.md#m12) |
| <a id="m13"></a>13 通用玩法开发能力 | [功能明细](docs/server/extensions.md#m13) |
| <a id="m14"></a>14 实时房间与对局 | [功能明细](docs/server/extensions.md#m14) |
| <a id="m15"></a>15 匹配、排行榜与赛季 | [功能明细](docs/server/extensions.md#m15) |
| <a id="m16"></a>16 社交、公会与聊天基础 | [功能明细](docs/server/extensions.md#m16) |
| <a id="m17"></a>17 时间、定时任务与离线补算 | [功能明细](docs/server/runtime.md#m17) |
| <a id="m18"></a>18 可靠队列与跨模块交付 | [功能明细](docs/server/runtime.md#m18) |
| <a id="m19"></a>19 重计算与资源调度 | [功能明细](docs/server/runtime.md#m19) |
| <a id="m20"></a>20 配置、数值与活动发布 | [功能明细](docs/server/platform.md#m20) |
| <a id="m21"></a>21 客户端接入、界面与资源 | [功能明细](docs/server/extensions.md#m21) |
| <a id="m22"></a>22 运营、客服与管理后台 | [功能明细](docs/server/platform.md#m22) |
| <a id="m23"></a>23 权限、安全与隐私 | [功能明细](docs/server/platform.md#m23) |
| <a id="m24"></a>24 日志、监控、告警与值班 | [功能明细](docs/server/platform.md#m24) |
| <a id="m25"></a>25 构建、部署、发布与回退 | [功能明细](docs/server/platform.md#m25) |
| <a id="m26"></a>26 多进程架构、基础设施与扩缩容 | [功能明细](docs/server/runtime.md#m26) |
| <a id="m27"></a>27 备份、恢复与数据修复 | [功能明细](docs/server/platform.md#m27) |
| <a id="m28"></a>28 测试、模拟与质量验收 | [功能明细](docs/server/ai-validation.md#m28) |
| <a id="m29"></a>29 AI 与开发者工作台 | [功能明细](docs/server/ai-validation.md#m29) |
| <a id="m30"></a>30 数据分析与经营报表 | [功能明细](docs/server/platform.md#m30) |
