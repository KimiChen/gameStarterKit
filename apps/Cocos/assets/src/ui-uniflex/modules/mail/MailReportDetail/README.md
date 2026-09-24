# 邮件 · 战报详情

`MailReportDetail` 是 750×1624 的战报详情弹窗，预览路由 `mail-report-detail`，目录名「战报详情」。邮件（`mail-popup`）的战报结果卡也会打开本面板；关闭详情保留邮件页签、折叠状态与滚动位置。

资源包为 `MailReportDetail`，资源 ID 前缀为 `ui/mail-report-detail/`；入库 PNG 的 `mail_report_detail_*` 对应原切图的 `mail_log_*`，图片字节不变。

原稿：`AI标准化/邮件/邮件-战斗日志_切图/切图参数.json`、`reference/log_log1.png` 至 `log_log4.png` 与 `长内容拼接.png`。切图文件夹误命名为“战斗日志”，实际是“战报详情”；独立的战斗日志见 `../MailBattleLog/README.md`，其切图来自“邮件-战报2_切图”。四张截图是本详情页同一条长列表的不同位置。窗体 (19,221) 714×1186、内容底 (40,303) 673×928；删除、分享固定在 y=1279/1278。

- 单层变高 `VirtualList`：战斗结果/伤亡 721px、船只 268px、英雄 408px、装备 727px、士兵 218px、属性 313px，共 2655px；末尾留 130px 避让空间。属性区进入视口时，战斗日志/部队详情入口固定显示在弹窗下沿，向上滚离末段时隐藏。
- 卡片背景按九宫格保留圆角；关闭与删除复用既有资源。参考整图和 PSD 不作为运行时资源。
- `gamecomponents/soldier/SoldierPortrait` 组合头像底图、图标及动态等级角标。黑色的 `mail_report_detail_soldier_l` 是底图；蓝衣士兵图标复用相邻 `邮件-士兵详情_切图/sprites/mail_soldier_portrait.png`，不是黑色占位。
- 重复项用显式数据接口并把整项传入子组件，避免当前 AOT 将未标注类型的数组字段折叠为第一项。

纯客户端展示：数据按原稿演示；`onClose` 关闭，`onAction` 提供 `delete`、`share`、`soldier-info`、`attribute-info`、`soldier:player`、`soldier:enemy`、`battle-log`、`troop-details` 回调。底部 `battle-log` 会打开独立的 `MailBattleLogPanel`，关闭日志保留本页位置。删除/分享与部队详情仅提供展示回调，未接服务器业务。

Web 登记：`screens.json`、`catalog.ts`、`preview-screen.ts`；Cocos 登记：`previewCatalog.ts`，`preview.ts` 提供 `createMailReportDetailPreview`；原稿首页可直接打开。

验收：`build:uniflex-ui` → `sync:client` → `typecheck:uniflex-ui`，从原稿首页进入，滚动检查各段、头像及末尾入口，检查操作回调、关闭/重开和邮件结果卡打开/返回。
