# 邮件 · 战斗日志

独立的 `MailBattleLog` / `MailBattleLogPanel`，750×1624。原稿为 `AI标准化/邮件/邮件-战报2_切图/reference/screen.png` 与 `切图参数.json`。预览目录名「战斗日志」，路由 `mail-battle-log`。

本页展示战斗简介、我方/敌方阵容和逐回合记录；`MailReportDetail` 是另一页「战报详情」，其原始切图文件夹曾误命名为战斗日志，两者不可混用。详情底部「战斗日志」入口打开本面板，关闭日志保留详情的滚动位置；该路径也适用于邮件 → 战报详情 → 战斗日志。

- 窗体 (19,221) 714×1186，标题「战斗日志」，关闭 (674,242) 50×50。
- 内容底 (37,303) 673×928；日期/全部回合操作条 (40,303) 673×49。
- 单层变高 `VirtualList` (47,362) 660×854；前三段高 149/152/146，默认回合高 407。回合数量来自 `rounds`，不嵌套列表。
- 简介、我方、敌方各自折叠；点击回合表头单独折叠该回合。「关闭所有回合」只收起回合，不影响简介或阵容；全部关闭时变为「展开所有回合」。空回合集禁用总开关。
- 同时复用战报详情的窗底/内容底，新增 5 张 PNG（本套关闭图与现有关闭资源字节不同）。标题条用切图，正文用纯色填充；正文色 `#F6F1EA` 以参考图实际像素为准。
- `BattleLogText` 用有颜色的定位文字片段保留参考行距和换行。展开箭头按双端已有 `rot:180` 节点约定翻转。

默认数据逐项照原稿（包括双方同为 91,760 / -223 的回合统计），属于客户端展示，不从兵力或事件数字推算战斗结果。`battleLogData.ts` 定义数据契约，默认阵容及一回合示例放在面板的 AOT 作者模块内。`timestamp`、`rounds` 可注入；每回合包含独立 ID、回合数、双方剩余生命/损失、文字片段和正文高度。

`onClose` 关闭；`onAction` 提供 `toggle:summary` / `toggle:player` / `toggle:enemy` / `toggle:round:<id>`、`collapse-all-rounds`、`expand-all-rounds`。未接服务器战斗结算。

预览登记包含 `screens.json`、`catalog.ts`、`preview-screen.ts`、`PreviewHome`、`previewCatalog.ts` 及 `createMailBattleLogPreview`。

验收：`build:uniflex-ui` → `sync:client` → `typecheck:uniflex-ui`，从首页进入、分区/回合开合、总开关、重开，以及邮件/详情/日志关闭返回。
