# 邮件

750×1624 的邮件弹窗，预览入口名为「邮件」，路由 `mail-popup`；旧全屏 `MailBattleReport`（`mail`）保持独立。

原稿：`AI标准化/邮件/邮件-战报_切图/切图参数.json` 与 `reference/mail_{base,system,alliance,personal}.png`。
切图入库在 `apps/client/resources/ui/Mail`，manifest 固定尺寸、SHA256 与九宫格边距；紫窗、关闭、黄按钮及战报图标复用既有资源。
不将 reference 整图和 PSD 当运行时资源。

- `MailPanel`：紫窗 (21,247)、708×1165；关闭 (653,264)；四个页签 (75/233/392/550,1384)。页签上部 28px 被窗体遮住，文字在露出的 63px 内居中。
- `MailInbox`：系统四封、联盟一封；卡片 661×159，间距 15，使用虚拟列表。
- `MailReports`：两个可折叠文件夹和战斗结果，flatten 为单层变高虚拟列表。初始第二文件夹已读按 `mail_base.png` 还原（切图说明的「已读默认隐藏」与该参考图不同）。展开第二文件夹后可滚动。
- 提示条显示当前页签的「邮件数：数量/容量」，默认容量 200，可由 `capacity` 覆盖。系统/联盟按列表条目计数，战报按文件夹内的全部报告计数（折叠不改变数量），个人为 0。
- 个人页显示「暂无邮件」，不显示删除/领取按钮；提示条下移至 y=1339。

点击战报结果卡会打开 `MailReportDetailPanel`（战报详情），关闭后保留当前页签、文件夹和列表位置。

这是客户端展示页。`onSelectTab` 报告页签切换；`onAction` 报告 `open:*`、`report:*`、`toggle:*`、`delete-read:*`、`claim:*`；`onClose` 由宿主处理关闭。折叠和已读显示为页面内演示状态，删除/领取只发回调，不接入账号邮件或奖励服务。默认打开战报页签，可用 `initialTab` 指定首签。

Web 的启动登记在 `apps/web-ui-preview/preview-screen.ts`，Cocos 在 `previewCatalog.ts`（`UniFlexPreview` 的委托目录）；`preview.ts` 另提供 `createMailPreview`。

本地验收：`build:uniflex-ui` → `sync:client` → `typecheck:uniflex-ui`，从预览首页打开，检查四页签、文件夹折叠/展开与滚动、操作回调、关闭及再次进入。普通切图页不要求服务端测试或全量门禁。

联盟邮件「成功加入联盟」打开 `MailContentPanel`（邮件内容），关闭保留页签及列表；与 `MailReportDetailPanel` 互斥显示。
