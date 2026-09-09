# 青原仙洲素材接入计划（尚未实施）

本轮只生成图片与素材说明。以下全部是未来计划，未修改客户端、服务端、shared、地形数据或 Cocos 资源镜像。

## 计划修改的文件

| 文件 | 计划修改内容 |
| --- | --- |
| `apps/client/src/kits/slg/logic/mapArt.ts`（新增） | 地表与装饰图集索引、UV、地标配置；按 chunk 与固定 seed 确定性布置装饰；总览坐标换算。装饰锚点和尺寸使用格单位，北向对应世界 y 增大。 |
| `apps/client/src/kits/slg/view/SlgChunkRenderer.ts` | 在现有每 chunk 一个 Mesh 的基础上接入地表图集与 UV，保留归属着色和近景网格；为图集边缘留采样内缩。禁止每格创建一个节点。 |
| `apps/client/src/kits/slg/view/SlgDecorationRenderer.ts`（新增） | 独立绘制透明树丛、山峰、宗门、遗迹与灵晶；按可见 chunk 缓存、批量绘制并卸载；装饰放在地表之上、选中框之下；对象池与资源销毁成对管理。 |
| `apps/client/src/kits/slg/logic/mapLayers.ts` | 登记装饰和地标层的显示规则；近景显示完整装饰，中景减量，远景仅保留地标。 |
| `apps/client/src/kits/slg/logic/mapCamera.ts` | 添加有界的坐标定位方法；定位前取消拖动惯性与旧触点，保持现有缩放范围和地图边界。 |
| `apps/client/src/kits/slg/view/SlgWorldOverview.ts`（新增） | 独立总览组件：方形底图、地名与地标、当前视野框、返回按钮；点击总览换算为世界坐标并定位。总览不请求全世界地块、不扫描一亿格。 |
| `apps/client/src/kits/slg/view/SlgMapView.ts` | 加载贴图资源，挂载装饰层和总览入口；总览打开期间停止局部地图手势/惯性/选格操作，避免点击穿透；统一刷新、加载失败重试和关闭回收。 |
| `apps/client/test/slg-art.test.ts`（新增） | 图集坐标范围、装饰确定性、相邻 chunk 无重复、每 chunk 数量上限、LOD 子集关系、世界与总览坐标往返及边界测试。 |
| `apps/client/test/slg-map.test.ts` | 覆盖总览定位后的相机边界、旧请求丢弃、地图关闭后晚到响应不能恢复页面等交互行为。 |
| `tools/creator-preview/slg.mjs` 与 `apps/server/test/creator-preview-tool.test.ts` | 扩展真实引擎预览证据：贴图加载、透明叠加、各档 LOD、总览开关/定位和关闭回收；验证从公开 UI 观察到的结果。 |

## 计划调整的数据与素材登记

| 文件或目录 | 计划内容 |
| --- | --- |
| `apps/kits/slg/data/terrain.json` | 六类地形色板与紧凑区域布局：中心草原、北雪、西赭土、南林、东水。保持已有 shape、16 色与 512 区域上限。 |
| `apps/kits/slg/art/qingyuan-v1/atlas.json`（未来新增） | 素材实际尺寸、图块矩形、锚点、透明边界、地标坐标与版本；明确素材坐标与世界坐标关系。 |
| `apps/Cocos/assets/resources/kits/slg/` | 后续导入批准的图片与地形资源，交由 Creator 生成导入 `.meta`；当前未写入此目录。 |
| `apps/kits/slg/README.md` | 接入并验证后才回写实际能力、素材来源、验收结果和余留限制；本轮不回写为已实现。 |

## 接入约束

- 地表图集与装饰图集都是 3 列 × 2 行，每格 512 × 512；行序从图像上方向下。地表为草、林地、水、赭土、岩、雪；装饰为树丛、青山、雪山、宗门、遗迹、灵晶。
- 世界仍是 10000 × 10000 格，16 × 16 格/chunk。装饰仅按当前加载 chunk 生成，建议每 chunk 最多 7 件（含地标），首版按实测密度调整。
- AI 总览是美术底图，并非从当前 `terrain.json` 生成的地理真相。正式启用点击定位前，须将总览地貌轮廓与同一份地形数据标定一致；若不做标定，则用地形区域直接绘制准确总览，AI 图仅作风格参考。不能把未标定底图宣称为精确导航地图。
- 地形与装饰保持视觉语义；本计划不新增阻挡、寻路、宗门经营、采矿、传送或行军规则。
- 地表尚未做实际引擎中的无缝重复与图集渗色验收；正式导入时检查连续铺设、UV 内缩、过滤与 mipmap 设置。
- 不手改 `apps/client/src/shared/` 或 `apps/Cocos/assets/src/`。未来修改真源后由同步命令刷新镜像；按实际改动运行类型检查、客户端测试、`verify:all` 和 Creator 实机预览。
