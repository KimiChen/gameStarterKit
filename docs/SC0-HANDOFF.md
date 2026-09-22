# SC0 原型移交清单

日期：2026-09-22；批次：SC0-B4。本文登记原型的去向，不将 SC1–SC5 的接口或工具提前记为完成。
阶段结论见 [SC0 审阅摘要](perf/stage3d/2026-09-22-sc0-review.json)；
预算与适用范围见 [3D-ASSETS.md §15](3D-ASSETS.md)，施工依赖与勾选见 [3D-PLAN.md](3D-PLAN.md)。

## 1. 移交规则

- “保留”指保留验收资产、断言、现有配置或历史记录，不表示原型已成为正式框架 API。
- “替换”须在目标批次完成正式实现与对应回归后进行；删除临时实现时同步清除入口、导入和诊断引用。
- `apps/client/src` 是客户端真源；注册表用 codegen 更新，`apps/Cocos/assets/src` 用 `sync:client` 更新，禁止手改镜像。
- SC0 固定桌面夹具不证明真实微信设备性能、缓存行为、任意骨架或内容包工具链；SC4-B3 和 SC5 继续执行各自验收。

## 2. 运行时原型

| 当前文件 | 目标批次与处置 | 正式化前的边界 |
| --- | --- | --- |
| [Stage3dFixtureView.ts](../apps/client/src/view/Stage3dFixtureView.ts)、[sidecar](../apps/client/src/view/Stage3dFixtureView.view.json) | SC1-B2/B3/B4：保留场景和生命周期断言，改为经 `ports.stage3d.acquire` 取得舞台 | 当前直接创建场景根、相机、灯；没有舞台 / 独立全局租约、统一 token 表或双入口注入 |
| [Stage3dSpikeHudView.ts](../apps/client/src/view/Stage3dSpikeHudView.ts)、[sidecar](../apps/client/src/view/Stage3dSpikeHudView.view.json) | SC1-B4/B9：迁成正式 overlay 夹具，继续覆盖模态关闭与迟到 setup | 当前 DEV 固定页、`interactive:false`；`ViewMgr` 按名称特判，尚无 `inputMode:overlay` |
| [Stage3dFixtureLogic.ts](../apps/client/src/logic/page/Stage3dFixtureLogic.ts)、[spikeSession.ts](../apps/client/src/view/scene3d/spikeSession.ts) | SC1-B4/B9：保留用例，替换指针归属原型与全局诊断 session | 固定指针表和坐标累计不是 SC2 的 cameraRig、LOD、流式或拾取数学 |
| [spikeInput.ts](../apps/client/src/view/scene3d/spikeInput.ts)、[spikeFguiInput.ts](../apps/client/src/view/scene3d/spikeFguiInput.ts) | SC1-B9：迁入正式 `view/input/` 适配器和 owner 绑定 raw-input 订阅 / 取消端口，再移除 spike 文件 | 当前单个 world 订阅者和 FairyGUI 1.2.2 实例处理器适配；只验证固定夹具所需分流 |
| [ViewMgr.ts](../apps/client/src/view/ViewMgr.ts)、[AppRuntime.ts](../apps/client/src/app/AppRuntime.ts)、[SnakeWorldView.ts](../apps/client/src/view/rooms/snake/SnakeWorldView.ts) | SC1-B9：替换 `hasSpikeHud`、hide 取消与 Snake 全局触摸旁路；所有 presentation 接入同一适配器 | pointer 必须在玩法 router 前归属；`dispatchInput` 后置业务过滤不能替代原始输入分流 |
| [Stage3dFixtureView.ts 的 loader](../apps/client/src/view/Stage3dFixtureView.ts) | SC1-B2/B4：成功回调即经真实同步 retainer 持有；SC3-B1/B4：换完整 AssetLease | 当前 `resources.load` + 直接 addRef/decRef 没有 bundle 寻址、15 秒 deadline 或正式批量失败语义 |
| [spikeOwnedInstancing.ts](../apps/client/src/view/scene3d/spikeOwnedInstancing.ts) | SC1-B3 先交空舞台生产适配；SC1-B4 封装 owned rendering 退休与夹具资源持有顺序；SC3-B3、SC4-B1 延续实体 / 蒙皮生命周期断言，完成替换后删除 spike 文件 | 私有结构只绑定 Creator 3.8.8 WebPipeline；不得直接成为 kit API，不得清全局共享池 |
| [spikeSkinning.ts](../apps/client/src/view/scene3d/spikeSkinning.ts) | SC4-B1：迁移布局、实际 jointTexture 分组、跨图切换与实时初始化修正 | 固定两骨、四 clip、两图集；72/144 行宽不是任意骨架通用配置 |
| [Stage3dFixtureView.ts 的粒子初始化](../apps/client/src/view/Stage3dFixtureView.ts) | SC4-B2：迁入 Vfx 生命周期与池管理 | 仅一个 capacity=50 的粒子实例；尚无池、LOD 门、定时回收或并发上限 |
| [builtin/plugin.json](../apps/plugins/builtin/plugin.json)、[navigation.test.ts](../apps/client/test/navigation.test.ts) | SC1-B4/B9：按正式夹具调整路由与退出取消回归，再生成注册表和镜像 | `stage3dFixture` / `stage3dSpikeHud` 入口登记不代表正式舞台或输入能力 |

输入验收必须保留 HUD / 世界双指并行、双向跨界、wheel、按住 boost 开模态、关闭 / 重挂取消及只接受新手势的断言。
FGUI 空白不保证传到全局 `input`；SC0 已验证从 UI/GRoot 明确分流。正式化继续使用该事实，不修改 vendor。
普通加载失败应等在途回调收齐后统一释放；超时 / 取消及时结束并回收迟到资源，保持 SLG 既有行为。

## 3. 六项引擎修正的去向

来源、安装版源码 SHA、旧失败和最终重验关联统一保留在 [sc0-engine-findings.json](../tools/art3d/sc0-engine-findings.json)。

| 修正 | 已验证的处理 | 移交与限制 |
| --- | --- | --- |
| 精确回收本 owner 的 instancing 缓冲 | 模型销毁 / 替换前记录 descriptorSet；AFTER_DRAW 区分本帧活动队列与缓存队列，仅销毁本 owner 已退出渲染的 VB/IA；仍活动则继续持有资源 | SC1-B4、SC3-B3、SC4-B1；B3 空舞台接线不代表已验证资产退休，lease 取消不等于允许 decRef；保护外来 owner 复用、源 mesh 缓冲和全局 PassPool；引擎升级重验 |
| 粒子容量在激活前配置 | inactive 节点添加组件并设 capacity=50，再挂入场景激活，避免 3.8.8 已初始化模型重建时丢失旧缓冲引用 | SC4-B2；不能据此允许任意运行时容量变更 |
| 回收粒子 processor 默认材质 | 经公开 `processor.getDefaultMaterial()` 记录此实例材质，等旧渲染引用退出后销毁 | SC4-B2；不能销毁共享外来材质 |
| 首次实时模式重建动画状态 | 先挂非 instancing 材质，再切 `useBakedAnimation=false`，只调用一次 `addClip(existingMainClip)` 重建无 evaluator 的旧状态；之后复用 | SC4-B1；不改私有状态、不复制 clip、不反复重建；恢复时先切 baked 再恢复共享材质 |
| 自定义关节纹理行对齐 | 两固定布局采用 float 宽 72、Creator RGBA8 宽 144；每骨每帧 3 / 12 texel 不跨 shader 行 | SC4-B1；正式布局按真实骨架和 clip 计算，保留跨行反例；不能沿用旧 64/128 布局 |
| RGBA8 故障注入保持能力一致 | 引擎启动前同时屏蔽 float sampling 和相依 color-buffer 扩展，核对 SAMPLED_TEXTURE / RENDER_TARGET 均缺席、实际 RGBA8 和 shader macro=0 | SC4-B3 探针；只操作自有页面并恢复 hook，不能将注入结果记为天然低端 / 微信设备证据 |

跨图集另须保留当前按父 Material/Pass 隔离的事实：3.8.8 `InstancedBuffer.merge` 不把 jointTexture 放入分批键。
正式 SkinnedUnits 按实际 jointTexture 和兼容实例布局分组，切 clip 后重新分组，不以 GLB 文件、UUID 或 clip 名替代 GPU 身份。
两个 biped 的 `allowMeshDataAccess=true` 是引擎读取骨骼包围盒所需例外；每份 native mesh 数据 15,936 bytes 只是数据下界，
不等于实测完整 CPU 内存。其证据见 [creator-import-report.json](../tools/art3d/creator-import-report.json)。

## 4. 类型桩与配置

[cc-stub.d.ts](../apps/client/cc-stub.d.ts) 和 [client-test-stubs.d.ts](../apps/client/client-test-stubs.d.ts)
仅补齐 SC0 实际使用的成员。SC1-B1 必须按本机 3.8.8 声明补全正式消费面，两套同步验证。

| 已有最小面 | 尚未声明或需要补齐 |
| --- | --- |
| Camera 的 projection、priority、visibility、fov、near/far、clearFlags/clearColor | `rect`、`screenPointToRay`；ClearFlag 目前只含 SOLID_COLOR / DEPTH_ONLY，按实际用法补其余值 |
| Prefab.data/addRef/decRef/refCount、instantiate、resources.load | 通用资源持有类型、`AssetManager.Bundle`、`assetManager.loadBundle` 及实际使用的 Bundle 成员 |
| DirectionalLight.illuminance、SkeletalAnimation 的 baked/clips/addClip/play/stop、SkinnedMeshRenderer.skeleton、ParticleSystem 最小成员 | `SkinnedMeshBatchRenderer`、`LODGroup`、`Billboard` 及正式实现实际需要的成员 |
| Vec3、Rect、Layers.Enum 的 DEFAULT/UI_2D 和字符串索引 | `Quat`、`geometry.Ray` / `AABB`、`Tween`；保留层位要有明确契约，不能只依赖索引签名 |
| director.getScene().globals?.postSettings?.toneMappingType | 正式 `SceneGlobals` 与 skybox / fog / shadows / postSettings / ambient；全局租约使用面 |

保留 [engine.json](../apps/Cocos/settings/v2/packages/engine.json)、[project.json](../apps/Cocos/settings/v2/packages/project.json)
和 [wechatgame.json](../apps/Cocos/settings/v2/packages/wechatgame.json)。最后一份只记录扩展版本，没有 AppID 前置。
内置新管线使用 Builtin / WebPipeline，保留 WebGL1/2、3D、骨骼动画、3D 粒子、light-probe、meshopt、UI 与 Spine 4.2。
`custom-pipeline-builtin-scripts` 的 cache 开关保留为 true；Creator 会从 includeModules 正规化移除该依赖项，不手动补回。
登录静态展示及 [Spine 3.8 原素材归档](../apps/art/fairygui/archive/Dynamic_Spine/README.md) 保留，不恢复旧运行时资源。

| 已实测相机 / 层位 | 固定夹具值 |
| --- | --- |
| STAGE3D_HIDDEN / STAGE3D_OVERLAY | bit 0 / 1，mask 1 / 2；project.json 存 mask，预览 customLayers 存 bit |
| 3D 相机 | priority=0、projection=1、visibility=1073741826（DEFAULT \| 2）、clearFlags=7、rect=(0,0,1,1) |
| UI 相机 | priority=1073741824、projection=0、visibility=41943040、clearFlags=6、rect=(0,0,1,1) |

clearFlags=7 清颜色 / 深度 / 模板；6 只清深度 / 模板并保留颜色。三条桌面上下文均记录该叠加关系。
SC1-B8 仍须实现画质、压缩预设与验收场景；SC0 配置不提前认领这些交付。

## 5. 资产、工具与证据

| 文件 / 目录 | 去向与保留范围 |
| --- | --- |
| [greybox.py](../tools/art3d/greybox.py)、[requirements.txt](../tools/art3d/requirements.txt)、[greybox-manifest.json](../tools/art3d/greybox-manifest.json)、[test_greybox.py](../tools/art3d/test_greybox.py) | 保留确定性自制生成与反例；SC1-B4/B5、SC4-B1 复用，SC5-B1 扩充；尚无 Unity 抽取或离线 LOD |
| [框架灰盒目录](../apps/Cocos/assets/resources/stage3d/) | 保留 greybox-cube/plane/biped/biped-atlas-b.glb、外置 T_Greybox_Checker_BC.png 及 Creator meta；实际 Prefab 路径按导入报告的 `stage3d/<stem>/<stem>` 使用 |
| [烘焙作者场景](../apps/Cocos/assets/stage3d-bake-workbench.scene)、[独立 Prefab](../apps/Cocos/assets/resources/stage3d/P_Stage3d_Baked.prefab)、[LightFX PNG](../apps/Cocos/assets/resources/stage3d/lightmaps/LightFX/output/LFX_Mesh_0000.png) 及 meta | SC1-B8/B4 复用；作者场景不加入运行入口；Prefab 必须脱离作者场景及其 lightmap 数组独立加载 |
| [sc0-asset-exceptions.json](../tools/art3d/sc0-asset-exceptions.json) | SC1-B5 迁入 scripts/assets3d.config.json 并实现正反例；当前只是精确路径 / UUID / SHA 登记，不能视作自动资产闸 |
| [editor-probe 模板](../tools/art3d/editor-probe/README.md) | SC1-B8 复用隔离工程路径护栏、作者态和烘焙流程；main.js / scene.js 内部消息按 3.8.8 绑定，升级重验 |
| [probe-stage3d.mjs](../tools/creator-preview/probe-stage3d.mjs)、[stage3d-boot.mjs](../tools/creator-preview/stage3d-boot.mjs)、[stage3d-diagnostics.mjs](../tools/creator-preview/stage3d-diagnostics.mjs) | SC1-B4/B9 移交真实输入 / 生命周期剧本与来源核对；保留冷启动精确诊断分类，不能扩大错误豁免 |
| [stage3d-sampling.mjs](../tools/creator-preview/stage3d-sampling.mjs)、[probe-stage3d-rgba8.mjs](../tools/creator-preview/probe-stage3d-rgba8.mjs) | SC3-B5 正式化采样；SC4-B3 复用显式能力故障注入，保留真实帧时与原始长帧 |
| [probe-stage3d-baked.mjs](../tools/creator-preview/probe-stage3d-baked.mjs)、[summarize-stage3d-baked.mjs](../tools/creator-preview/summarize-stage3d-baked.mjs) | 保留独立加载、依赖失败 / 重试、回收与摘要逻辑；视觉复核仍由单独审阅记录确认 |

普通 3D 贴图继续遵循 mip 规范；唯一 LightFX 采样例外仅限登记 PNG/meta 的准确身份和已验证固定距离。
连续缩放、远距离、UV 岛内部 padding 和整条 mip 保真没有被本次固定距离对比证明；变更后必须重验。
模型导入、UUID 与子资产检查移交 SC1-B7/B5，不能以当前 resources 夹具加载替代无开发树 / Library 缓存的包安装验收。

客户端回归保留 [stage3d-fixture-lifecycle](../apps/client/test/stage3d-fixture-lifecycle.test.ts)、
[stage3d-spike-hud-lifecycle](../apps/client/test/stage3d-spike-hud-lifecycle.test.ts)、[stage3d-spike-input](../apps/client/test/stage3d-spike-input.test.ts)、
[stage3d-owned-instancing](../apps/client/test/stage3d-owned-instancing.test.ts)、[stage3d-spike-skinning](../apps/client/test/stage3d-spike-skinning.test.ts)；
正式替换时迁移断言，不因删除 spike 实现而删掉失败、迟到回调、取消、乱序释放和共享资源隔离用例。
工具回归通过 [stage3d-probe](../apps/server/test/stage3d-probe.test.ts)、[stage3d-tool-regressions](../apps/server/test/stage3d-tool-regressions.test.ts)、
[stage3d-baked-summary](../apps/server/test/stage3d-baked-summary.test.ts) 进入既有测试链；对应 .mjs 测试保留。

原始截图、报告和日志留本地，数字摘要留 [docs/perf/stage3d](perf/stage3d/)。原报告的 ok/exitCode/pending 与失败历史不回写为成功；
最终接受结论由 [SC0 审阅摘要](perf/stage3d/2026-09-22-sc0-review.json) 和原始文件 SHA 关联。
生成 manifest 中 observed=null 仍是待验需求模板，不代替 [实际导入报告](../tools/art3d/creator-import-report.json)。
本地 `extensions/stage3d-probe` 安装副本、LightFX 绝对路径历史、缓存和证据保持 ignored；不混入包干净安装夹具。

## 6. SC1 次序与串行集成

SC0 退出后，舞台线按 B1 → B2 → B3 → B8，输入线 B9，包资产线 B7 → B5 推进。
B4 等 B8/B9，B5 另等 B8；B6 在全部依赖、双 WebGL 证据及全量检查完成后退出。
SC2 / SC3 在 SC1 退出后并行；SC4 等 SC2 + SC3。这里仅登记后续顺序，不勾选任何 SC1 项。

Creator、浏览器、引擎配置、生成物、包锁与保护锁由主集成者串行操作，Creator 始终指向隔离工程。
修改输入 / app 接缝或新增保护路径时按实际 diff 重钉 [protected-paths.lock](../scripts/protected-paths.lock)，不得以旧锁掩盖新变化。
每批保护已有未提交修改后执行约定的 `git pull --rebase`，再按真源动线生成、同步并完成该批 `verify:all`、类型与变异验证。
只提交该批文件；独立批次独立提交。推送仍等待用户明确确认，原工作区未提交改动保持原处。
