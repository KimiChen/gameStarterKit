# 青原仙洲素材接入记录

2026-09-10 已按用户选择的仙洲布局完成代码与资源接入。本文件记录实际改动及验收范围；最初“只生成素材”的阶段已经结束。本轮 `verify:all` 与 Creator 真实引擎验收均通过，结果见末节。

## 已实现的文件

| 文件 | 实际接入内容 |
| --- | --- |
| `apps/client/src/kits/slg/logic/mapArt.ts` | 图集索引与 UV、地标配置、按 chunk 确定性布置装饰、世界与总览坐标换算，以及同源总览区域生成。这里是美术配置唯一真源，未新增 `atlas.json`。 |
| `apps/client/src/kits/slg/logic/terrainMesh.ts` | 无引擎依赖的地表与归属几何；地表按世界格 x/y 奇偶镜像 UV，并按实际贴图尺寸内缩半个纹理像素。同地形在块内与跨块边界采样一致；ID 0–5 使用原图颜色，6–15 用色板 RGB 为草地后备纹理着色。 |
| `apps/client/src/kits/slg/view/SlgChunkRenderer.ts` | 每 chunk 一个地表动态网格，已占领格另建独立无贴图半透明网格。我方蓝色、敌方红色，alpha 0.40；不为每格创建节点。 |
| `apps/client/src/kits/slg/view/SlgDecorationRenderer.ts` | 每个非空 chunk 一个透明贴图动态网格，最多 7 件装饰；按 chunk 与 LOD 缓存，空块也记住结果。权威地块版本变化不重建装饰，卸载时销毁节点和网格；未实现对象池。 |
| `apps/client/src/kits/slg/logic/mapLayers.ts` | 统一控制网格、装饰和地标显示。内部 LOD 0–3 的普通装饰上限为 6/4/2/0，已加载块内的地标四档均保留。 |
| `apps/client/src/kits/slg/logic/mapCamera.ts` | 有界坐标定位；定位前取消拖动惯性与旧触点，维持原有缩放和地图边界。 |
| `apps/client/src/kits/slg/view/SlgWorldOverview.ts` | “实地图”从同源地形区域绘制轮廓，叠加同源地标、当前位置和视野框，支持点击地图或地标定位。“山河绘卷”只预览原始美术图，不参与导航；总览不读取全世界地块。 |
| `apps/client/src/kits/slg/view/SlgArtResources.ts` | 一并加载地形 JSON 与三张贴图，验证资源与图集尺寸，持有引用并提供幂等释放；部分失败时等待在途加载回调完成后回收全部已取得引用。 |
| `apps/client/src/kits/slg/view/SlgMapView.ts` | 装配地表、归属、装饰和总览；总览打开期间隔离局部地图手势、惯性和选格。资源失败可“刷新”重试；关闭或过期加载不会恢复已关闭页面，先销毁渲染资源再释放贴图引用。 |
| `apps/client/test/slg-art.test.ts` | 图集范围、装饰确定性与数量上限、块内完整边界、LOD 子集、地标、同源总览与世界坐标测试。 |
| `apps/client/test/slg-terrain-mesh.test.ts` | 同地形接边 UV、图集半像素内缩、16 色兼容、独立归属颜色、四档 LOD 间隙与远端 chunk 容量测试。 |
| `apps/client/test/slg-art-assets.test.ts` | 运行图片与源图逐字节一致、图片实际尺寸、透明 PNG alpha 与六格内容、导入采样参数测试。 |
| `apps/client/test/slg-art-resources.test.ts` | 乱序加载、部分失败后的晚到回调、无效数据与尺寸、幂等释放和多个页面共享缓存纹理的引用计数测试。 |
| `apps/client/test/slg-map.test.ts` | 保留相机、分块和异步请求回归，并覆盖总览定位取消旧手势及世界边界。 |

## 数据与资源

| 文件或目录 | 当前内容 |
| --- | --- |
| `apps/kits/slg/data/terrain.json` | 「青原仙洲」10000×10000 格，六类地形色板与 55 个矩形区域；北雪、西赤岩、南林、东海、中央青原。维持现有 shape、16 色与 512 区域上限。 |
| `apps/Cocos/assets/resources/kits/slg/terrain.json` | 地形源 JSON 的逐字节镜像；局部地形和“实地图”使用同一份数据。 |
| `apps/kits/slg/art/qingyuan-v1/` | 批准的三张成品图、去背底稿、提示词与本记录。地表/装饰为 1536×1024，3 列×2 行、每格 512×512；绘卷为 1254×1254。 |
| `apps/Cocos/assets/resources/kits/slg/qingyuan/` | 地表、透明装饰、绘卷三张运行时图片及导入 `.meta`。图片与源图相同；采样声明为线性、clamp-to-edge、无 mipmap，底稿未导入。 |
| `apps/kits/slg/README.md` | 实际展示能力、配置边界、资源生命周期与本轮验收状态。 |

## 保持的约束

- 世界仍为 10000×10000 格、16×16 格/chunk；SQL 只保存发生变化的格子。局部渲染只生成已加载 chunk 的几何，装饰按固定候选槽生成，总览只遍历地形区域；均不扫描一亿格。
- 世界以格为单位、y 增大指向北；PNG 和总览采用左上原点、y/v 向下。装饰使用中心锚点，其完整范围留在所属 chunk 内。
- 地表的镜像重复用于使边界采样一致；不承诺首版绘制已消除重复纹样，视觉质量由真实引擎预览确认。
- 绘卷没有与实际地图逐像素标定，所以导航始终使用同源“实地图”；宗门、遗迹和灵晶只是视觉地标。
- 不新增地形阻挡、寻路、宗门经营、采矿、传送或行军规则，不改变 shared 协议与服务端写入规则。
- 不手改 `apps/client/src/shared/` 或 `apps/Cocos/assets/src/`；真源改动由同步命令刷新代码镜像。图片和地形资源镜像有独立逐字节校验。

## 本轮验收

- `verify:all` 退出 0：FGUI 66、inventory 115、客户端 513、服务端 751 个测试通过，包含类型检查、同步及既有矩阵。
- Creator 真实桌面预览 23 步通过，19 张原始截图、console 空：地表和透明装饰、我方归属、拖动、四档 LOD、实地图地标定位、绘卷输入隔离、关闭与重新加载。另留三张隐藏调试叠层的展示截图。见 docs/evidence/creator-2026-09-10/slg-art/（本地预览证据，按 .gitignore 政策不入库）。
- `tools/creator-preview/slg.mjs` 与 `apps/server/test/creator-preview-tool.test.ts` 已扩展；总览隐藏主图期间不读取不存在的公开主图节点，关闭后再核验位置未变。
- 未做 Creator 资源失败注入、敌方红色归属场景、真实触屏或长跑内存实验；失败回调与资源引用计数、红蓝归属几何、坐标及相机行为由客户端测试覆盖。

2026-09-09 已通过的阶段 1/2a 全量、桌面预览、临时制品安装和独立数据库验收，继续保留在 [SLG README](../../README.md) 与其引用的历史证据中；不改写为本轮美术验收。
