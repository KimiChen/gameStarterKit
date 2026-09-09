# 青原仙洲美术接入：Creator 桌面预览证据

2026-09-10（Asia/Shanghai），在 Cocos Creator 3.8.8 真实预览、本机 Chrome 9222 与现有开发游戏服中验证地表、透明装饰和世界总览。[report.json](report.json) 记录 23 个步骤全部通过、19 张原始截图、`console:[]`。

本轮采用北雪、西赤岩、南林、东海、中央青原的六类地形、55 个矩形区域，维持 10000×10000 格、16×16 chunk、四档 LOD。地表与装饰各使用一张 1536×1024 图集；实地图由同一份地形数据绘制，原始 1254×1254 美术总览放在「山河绘卷」页，仅供观赏。

## 交互与渲染证据

| 检查 | 证据 |
| --- | --- |
| 登录、正式入口、贴图地表与独立透明装饰层 | [04-slg-opened.png](04-slg-opened.png)；报告检查实际 MeshRenderer 共享材质中的纹理及尺寸 |
| 占领、归属叠加与权威刷新 | [06-slg-captured.png](06-slg-captured.png)、[07-slg-refreshed.png](07-slg-refreshed.png)；此轮 `(5000,4999)` 变为我方守备 1，奖杯 3→4 |
| 拖动与四档缩放 | [09-slg-lod-1.png](09-slg-lod-1.png)、[10-slg-lod-2.png](10-slg-lod-2.png)、[11-slg-lod-3.png](11-slg-lod-3.png)、[12-slg-lod-4.png](12-slg-lod-4.png) |
| 同源实地图、地标、视口框 | [13-slg-world-navigation.png](13-slg-world-navigation.png)；公开位置、五个地标和四条视口边框 |
| 独立绘卷及点击隔离 | [14-slg-world-scroll.png](14-slg-world-scroll.png)；点击绘卷保持总览，关闭后原地图位置、LOD、选格不变 |
| 实地图精确定位 | [15-slg-world-located.png](15-slg-world-located.png)；点「北岭遗迹」后到 `(5480,8584)`，雪地和遗迹正确显示 |
| 返回、关闭与重新加载 | [16-slg-world-returned.png](16-slg-world-returned.png)、[18-slg-reopened.png](18-slg-reopened.png)、[19-slg-reopened-closed.png](19-slg-reopened-closed.png) |

脚本只读取公开引擎节点、文本与渲染组件，发送普通 CDP 点击、拖动和滚轮；未直接调用页面 Logic、RPC 或私有相机字段。打开及各 LOD 取证至少等待 2.4 秒，且 chunk 集合与公开世界位置连续 1.2 秒稳定。重新进入验证资源可恢复，资源引用释放的精确计数由客户端加载器测试覆盖。

首次尝试被旧预览页重连挤下线，中止记录留在本机 `/tmp/slg-art-session-conflict-2026-09-10`，不计入本次通过报告。重跑前临时冻结已有预览标签页，完成后全部恢复。未修改账号、登录机制或正式运行配置。

## 展示预览

以下是同一真实预览页面通过公开 UI 再次打开地图后截取的画布；仅临时调用 Creator 公开 `profiler.hideStats()` 隐藏调试叠层，截取后恢复，未做图片后期处理。记录见 [presentation.json](presentation.json)。

- [局部地图与透明装饰](preview-local.png)
- [实地图](preview-navigation.png)
- [山河绘卷](preview-scroll.png)

## 自动检查与边界

[最终 `verify:all` 完整日志](verify-all.txt)：命令退出 0；FGUI 66、inventory 115、客户端 513、服务端 751 个测试全部通过，类型检查、同步检查及既有矩阵通过。包含资源加载器乱序回调、部分失败及共享资源引用释放的 9 项测试；客户端 SLG 相关测试合计 36 项。

本次没有改动 shared/RPC、SQL、即时占领或行军规则。此前 9 月 9 日的干净安装、空库迁移及集成测试保留为历史基线，见 [原验收记录](../../creator-2026-09-09/slg/README.md)。本轮没有重新声称这些实验已执行。

桌面预览已目检草地、透明树丛/宗门/灵晶、雪地远景、总览布局；图集六类索引、相邻边缘 UV、透明 alpha、镜像字节与导入采样另有测试。没有真实触屏、移动设备性能或长跑内存验收。原始截图中的 Profiler 数值仅是单次桌面读数。

## 复跑

按 [工具说明](../../../../tools/creator-preview/README.md) 启动本地前置进程，再在仓库根目录执行：

```bash
node tools/creator-preview/run.mjs slg --out /tmp/slg-art-rerun --format png
npm run verify:all
```

使用新的输出目录保留本次证据。避免多个开发预览标签页同时自动登录同一账号。
