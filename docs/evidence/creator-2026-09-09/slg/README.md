# SLG 万格地图：Creator 桌面预览证据

阶段 1 / 2a 已完成并验收：主树 `verify:all`、Creator 桌面预览、临时制品干净安装与独立空库验证全部通过。本目录汇总机器日志与预览截图，阶段 2b、MF5/MF7 不在本轮范围。

2026-09-09 23:54:38–23:55:02（Asia/Shanghai），使用 Cocos Creator 3.8.8 的真实引擎预览、可见 Chrome 标签页与本地游戏服，执行 `slg` 场景。此次 [report.json](report.json) 的 `ok:true`，17 个步骤全部通过，13 张截图，`console:[]`。

地图大小为 10000×10000（1 亿格），地形配置仅保存默认色与五个矩形，渲染按视口加载 chunk。此样本在地图中部 `(4996, 4999)` 点选无主格，观察到占领后归我方、守备 1、奖杯从 2 增至 3，刷新后保持；随后完成拖动与四档 LOD，再关闭回设置。

## 全量与干净安装

- [`verify:all` 完整日志](verify-all.txt)：命令退出 0，类型检查、同步检查及全部既有矩阵通过；FGUI 66、inventory 115、客户端 487、服务端 749 个测试通过。
- [干净安装验收](clean-install/README.md)：无 SLG 临时宿主安装 64 文件制品，真实 postinstall 与 package check 通过；锁驱动 `plugin -- test slg --int` 35/35，无失败/跳过，包含真实 SQL/Redis 集成 9 条。
- [独立空库首次 bootstrap](clean-install/fresh-bootstrap.txt)：SLG `001-init.sql` 4 条、`002-march.sql` 3 条建表语句，七表齐全；[重复 bootstrap](clean-install/fresh-bootstrap-repeat.txt) 新应用 0、跳过 3（含 arena）。临时库已清理，详情及制品 SHA 见 [结构化报告](clean-install/report.json)。
- 主树 SLG manifest 保持宿主自有、无版本。仅临时制品添加 `version:0.1.0` 以验证打包/安装；验收后的 README 文档回写与该制品之间的差异已在干净安装报告中明确，不影响其实现、资源、SQL 与测试字节。

## 复跑

前置：Creator 打开 `apps/Cocos`，预览服务在 `http://localhost:7456`；可见 Chrome 使用本机 `9222` 调试端口；本地 Redis/MySQL 与游戏服运行且已 bootstrap。详细动线见 [creator-preview 工具说明](../../../../tools/creator-preview/README.md)。

从仓库根目录运行，输出到新的临时目录以保留此证据：

```bash
node tools/creator-preview/run.mjs slg --out /tmp/slg-preview-rerun --format png
```

本次原始输出目录是 `/tmp/slg-preview-10000-stable`，随后将报告和截图复制入本目录。报告保留原运行选项、场景 UUID、步骤判据与观察值；未改写原始报告或截图。复跑会在可见区域寻找另一块无主格，具体坐标及初始奖杯数可能不同。

## 覆盖与证据

| 检查 | 证据 |
| --- | --- |
| 登录、首屏、设置中的正式“大地图 · slg”入口 | `01-login.png`、`02-home.png`、[03-settings.png](03-settings.png) |
| 原创地形与 chunk 网格加载 | [04-slg-opened.png](04-slg-opened.png)；报告 `loaded:true`，初始 9 个 chunk 节点 |
| 地块点选、免费占领、权威查询刷新 | [05-slg-selected.png](05-slg-selected.png)、[06-slg-captured.png](06-slg-captured.png)、[07-slg-refreshed.png](07-slg-refreshed.png)；报告保存操作前后坐标、归属、守备和奖杯 |
| 桌面鼠标拖动 | [08-slg-panned.png](08-slg-panned.png)；报告记录普通鼠标输入起止坐标与 `slg-world` 节点位置变化 |
| 桌面滚轮四档 LOD | [09-slg-lod-1.png](09-slg-lod-1.png)、[10-slg-lod-2.png](10-slg-lod-2.png)、[11-slg-lod-3.png](11-slg-lod-3.png)、[12-slg-lod-4.png](12-slg-lod-4.png) |
| 关闭回设置 | [13-slg-closed.png](13-slg-closed.png)；报告确认 `SlgMapView` 已卸载、`SettingsView` 保留 |

打开地图及各档 LOD 截图前，工具至少观察 2.4 秒，并要求 chunk 集合与地图位置连续 1.2 秒稳定，自动重试提示期间不截取稳定帧。报告的 `settling` 字段记录实际等待；LOD 1–4 的 chunk 节点数依次为 9、12、20、35（包含流式加载的保留范围）。LOD 4 此次等待 2441 ms，其中稳定 1220 ms，已目视确认地图区域铺满。

驱动只遍历真实渲染节点/公开文本并发送 CDP 鼠标点击、拖动与滚轮输入，没有直接调用页面 Logic、RPC 或私有相机字段。截图保留 Creator 默认 Profiler 叠层；LOD 4 截图显示 60 FPS，这是单次桌面预览的瞬时读数，不是容量、长跑、真机性能或 100 人同房结论。

## 未覆盖范围

- 触屏双指 pinch 目前由客户端相机逻辑测试覆盖锚点、双指中点移动与不误触选格；本次桌面预览没有真实触屏/CDP 双指输入实证。
- 阶段 2a 行军没有操作面板，派遣、撤回、到达结算与幂等/并发正确性以服务端测试和数据库实验为依据，不由这些截图证明。
- 阶段 2b 的 GameRoom/AOI、军队与行军线、跨房可见性和正式名册策略等待 MF5；无人在线 worker 等待 MF7。均未进入本次场景。
