# SC1-B8 画质与数据表

框架通过 `ports.stage3d.quality` 返回只读快照；gameplay 的 `services.stage3d` 为同一端口。
读取不会占舞台，也不会把渲染器初始化前的 unknown 结果永久缓存。
`view/scene3d/quality.ts` 读取 Creator 的 sys 与 GFX，纯函数 `logic/scene3d/qualityTiers.ts` 做判定。

微信（包括桌面开发工具）、WebGL1 / GLES2、未知平台 / GPU、软件渲染与已登记旧移动 GPU 默认 low。
已识别主流移动 GPU 为 medium，高端移动和已识别桌面 GPU 为 high；型号表是保守策略，不是性能证明。
开发环境可用 `?quality=low|medium|high&shadows=0`。生产不读取这些 URL 参数；`shadows=1`
不能越过档位政策。覆写不会修改平台 / GPU，也不能开启缺失的 ASTC、阴影、instancing 或关节纹理能力。
RGBA32F 不可采样时，仍保留有顶点纹理采样能力的 RGBA8 路径；实时蒙皮始终禁止 instancing。

默认预算沿用 [3D-ASSETS §15](../../docs/3D-ASSETS.md#15-sc0-冻结预算2026-09-22)：特效 8 / 24 / 48，
单位 50 / 100 / 100；low 无 details、无实时阴影，纹理降一级且最低 256。
缺 instancing 或可用关节纹理时，单位上限保守降到 25 / 50 / 50；这是回退政策，仍须 SC4 验容量。

## JSON 真源和校验

框架资源目录 [stage3d/data](../../apps/Cocos/assets/resources/stage3d/data/) 提供三张表，`version` 均为 1。
`logic/scene3d/qualityData.ts` 接收 unknown、拒绝未知字段、非法值、悬空池归属及缺失 / 重复纹理变体，
返回脱离输入对象的深度只读数据。地址始终是 `{ bundle, path }`，path 为相对、不带扩展名的 Creator 资源路径。
此校验不代替 SC1-B5/B7 的 UUID 依赖及包所有权检查。

| 表 | 字段与消费方 |
| --- | --- |
| `quality.json` | `tiers.low/medium/high`：details、shadows（off/main/all）、maxEffects、maxUnits、maxUnitsWithoutInstancing、textureStepDown、minTextureSize；当前画质判定消费 |
| `pool.json` | `maxActivationsPerFrame` 的三档整数；entries 的 id、prefab 地址、三档 capacity；SC3-B3 消费 |
| `detail-layers.json` | layers 的 id（base/details）、prefabs、pools、textures；每张纹理显式登记三种 quality × 三种 lod 的九个地址；可选 hideAtLod 按预制地址登记隐藏起始档。AssetPlan / EntityPool 共用此表。 |

每个池只能归属一个层，base 层必需。示例把 cubes 池放在 details 层；low 的资产计划不会请求它，B3 同时禁止激活。
池的 4 / 8 / 16 次每帧激活与 100 / 300 / 500 静态立方体容量由 SC3-B3 的 EntityPool 执行；
low 的 cubes 属 details，因此不激活。容量不等于性能承诺，各画质帧时证据仍归 SC3-B5。
棋盘纹理九个格子共用 SC0 的 64² 精确尺寸例外，供真实资源路径验证；普通内容必须登记实际离线变体。
纹理降档不改变网格 lod。SC3-B2 已验证九格精确选择与缺失处理；离线降尺寸仍由 SC5 验收。

SC3-B2 的 `AssetPlan` 接收这三张表及 chunk 内容清单，在选择变体前过滤禁用层。纹理表已经表达
textureStepDown / minTextureSize 的离线选择，运行时不二次降档或推导文件名。预制可另给三个显式
LOD 地址；省略则保持登记地址。两级模型在 LOD 1 / 2 重用远档，资源共享按 kind + bundle + path 去重。
不完整变体 / 未登记引用在建计划时拒绝，真实加载失败由 AssetLease 返回三态错误；View 归还失败请求后
调用 `reject(token)`，下次更新可重新请求同一地址。计划不接管引擎引用、节点或定时器。
调用方注入单调毫秒时钟，每帧 `update` 或 `flush`；出档默认延迟 5 秒释放，重入取消等待，关闭立即清空。
详细消费约定见 [CLIENT §3](../../docs/CLIENT.md#3-view-与-logic-分层)。

quality 默认政策从 JSON 生成小型 TypeScript 镜像，避免同步端口依赖启动时的异步资源加载：

```bash
node tools/art3d/sync-quality-defaults.mjs
npm run sync:client
```

`qualityDefaults.generated.ts` 禁手改；`test:client` 检查它与 JSON 字节一致，单独只读检查可用
`node tools/art3d/sync-quality-defaults.mjs --check`。其余两张表由调用方加载后交给资产计划或实体池；
实体池已在 `Stage3dDevScene` 装配，完整性能验收仍在 SC3-B5。

`EntityPool` 和计划共用 `AssetCatalog`：detail-layers.json 可加 `hideAtLod` 表（`{ prefab: { bundle, path }, lod }[]`），此档及以上同时停止加载和激活。
`Stage3dDevScene` 的 `entitiesEnabled` 是 500 灰盒开关（Creator 属性面板可设，预览中可调用
`setEntitiesEnabled(true / false)`）；每次打开提交 500 次 spawn，由表限制名额及逐帧激活。
默认关闭，关闭时 despawn + evict，页面退出 close。预览 `?quality=high` 验 500 个，medium 验 300 个，
low 验 details 零加载；真实 GPU 能力仍由 quality 限制。此开关保留独立烘焙样本，旧 SC0 页面证据不改写。

## 压缩与验收场景

[builder.json](../../apps/Cocos/settings/v2/packages/builder.json) 中的 `textureCompressConfig.userPreset`
登记 android / ios / web / miniGame：`3d-default` = ASTC 8×8 medium，`3d-alpha` = ASTC 6×6 medium，
两者均带 PNG quality80 回落；压缩 mipmap 保持启用。棋盘图片 meta 引用 `3d-default`，lightmap 不压缩。
`quality-assets.mjs` 校验预设与回落，供后续 B5 复用。引擎按实际格式支持选择下载资源，见
[Creator 官方压缩纹理说明](https://docs.cocos.com/creator/3.8/manual/zh/asset/compress-texture.html)。

在 Creator 打开 `assets/stage3d-dev.scene` 后预览：`Stage3dDevScene` 只加载三张 JSON 及独立
`stage3d/P_Stage3d_Baked`，经正式 Stage3D 和同步 retainer 持有；不经过 Main，不读取烘焙工位场景。
更新烘焙内容仍走 [editor-probe 的 SC0-B5 工作流](editor-probe/README.md)，随后在此独立复验。
`extensions/stage3d-build` 的全平台 `onBeforeBuild` 过滤 dev / bake-workbench 两个场景，拒绝将其作为启动场景。
首次加入扩展时在 Creator 扩展管理器刷新并确认启用；正常游戏启动场景仍是 `scene.scene`。

本批证据见 [SC1-B8 摘要](../../docs/perf/stage3d/2026-09-22-sc1-b8.json)。WebGL1 使用单独测试页禁止
WebGL2 context 创建，实际由 Creator WebGLDevice 渲染；不是微信真机证据。构建过滤在 Creator 中调用
注册钩子验证，不代表完整平台构建。20 次正式混合页面生命周期和 SC3/SC4 性能 / 缓存验证仍在后续批次。
