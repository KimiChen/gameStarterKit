# 3D 素材使用方式、规范与原则（框架级）

> - 日期：2026-09-22。状态：**规范 v1.5**（3D-PLAN 3D-41–3D-45、3D-47 审阅修订），与 [3d.md](3d.md) v1.5 对齐；SC0 已完成验证原型与 §15 预算冻结；正式框架能力仍按阶段交付。
> - 来历：对照 Cocos 官方 3D 演示项目 **Cocos Cyberpunk**（本机 `/Volumes/KimData/work/CocosCyberpunk`，仓外只读；Creator 3.8.4 工程，806 MB 资产，1,374 个模型、685 张图、259 个材质、262 个粒子系统）逐项实测，取其**做法**、⛔ 不取其**素材**（§14）；再对照本仓现状（`apps/Cocos` 3.8.8 工程、`resources/kits/<id>/` 所有权、`verify:sync` 的 `.meta` 闸、`tools/slg-maps/` 管线先例）落成本仓规则。
> - 定位：素材侧唯一规范；机制侧（Stage3D / AssetLease / 纯数学 / 机械件）在 [3d.md](3d.md)，施工批次在 [3D-PLAN.md](3D-PLAN.md)，lvr 内容需求在 [lvr-3d.md](../lvr-3d.md)。三者冲突以本文为素材口径、以 3d.md 为机制口径。
> - 治理：⛔ 不进 plan-v5；冻结数字与实测边界在 §15；实施状态不在本文回写（在 3d.md §10）。修订登记见 §16。

---

## 0. 十条原则

1. **作者态导入，运行时不解析**：模型 / 贴图 / 材质 / 动画都在 Creator 里导入成引擎资产（`.meta` + 子资产），运行时只 `resources.load` / bundle 加载；⛔ 运行时不需要 glTF / FBX loader（3d.md SD4）。
2. **静态先离线，运行时只做选择**：LOD 变体、静态合批、光照与反射探针、遮挡数据一律离线产出为资产；运行时只按**画质档 × 视口**选择加载哪些资产（Cyberpunk 校正：1,374 个模型 `lods.enable:false`、`LODGroup` 0 处、运行时阴影全关）。
3. **每次持有都有租约**：加载 / 释放只经框架 `AssetLease`（3d.md §4）；⛔ kit 内裸调 `addRef` / `decRef` / `resources.load`；页面关闭归还本页引用，其他页面 / 全局 token / 对象池的有效持有继续保留；全部业务持有结束后业务引用归零，GFX 内存按 §12 的预热后稳定基线验收。Cyberpunk 全量预载后永不释放（0 处 `decRef`）是**演示项目的取巧**，⛔ 不学。
4. **画质档决定加载什么**：`low / medium / high` 由平台 + GPU 查表得出（Cyberpunk `href-setting.ts` + `gpu.ts` 形态），细节层、特效并发、同屏单位上限、阴影都按档给；dev 可 URL 参数覆盖。
5. **贴图 POT + 平台压缩预设 + 体积预算**：3D 贴图一律 2 的幂、走框架压缩预设（astc_8x8 + png 回落，Cyberpunk 同款）、进 `art3d.config.json` 体积预算；UI / VFX / lightmap / 天空图不压或单独预设。
6. **命名即元数据**：前缀说类型（`SM_ / SK_ / T_ / M_ / FX_ / ANIM_ / ANIG_`），后缀说通道（`_BC / _N / _ORM / _E / _M`），目录说归属（框架 `resources/stage3d/`；包重资产 `bundles/<class>-<id>/3d/`、小数据 `resources/{kits,plugins}/<id>/3d/data/`）；机检读名字不读脑子。
7. **每个 3D 特性一个可目检的场景**：框架 `apps/Cocos/assets/stage3d-dev.scene` 与 kit 自己的验收场景（Cyberpunk `scene-development/` 十个特性场景同法），素材入库前先在场景里过一遍（§13）。
8. **数据表驱动**：预加载清单、对象池容量、画质档表、细节层归属都是 JSON（Cyberpunk `data-res-cache / data-pool / data-quality.json` 同法），⛔ 不写死在代码里。
9. **机检优先**：`verify:assets3d` 守格式 / `.meta` / UUID 依赖闭合与归属 / 体积 / 命名 / 导入选项 / 授权台账；Creator 目检、`--perf` 与真实微信证据不进自动聚合门禁，但所列证据是阶段人工退出条件。
10. **授权可追溯**：每个 kit / 插件的 3D 目录带素材授权台账（snake 先例）；合成灰盒零授权；**Cocos Cyberpunk 的任何文件 ⛔ 不得进仓**（其许可仅限学习研究，§14）。

## 1. Cocos Cyberpunk 实测对照表

| 项 | Cyberpunk 做法（实测） | 本仓采纳 | 差异 / 理由 |
| --- | --- | --- | --- |
| 引擎版本 / 模块 | Creator 3.8.4；`engine.json` **逐项显式**勾选（ON：3d、skeletal-animation、particle、marionette、spine、light-probe、custom-pipeline、physics-physx…；OFF：terrain、tiled-map、dragon-bones、xr、legacy-pipeline…） | SC0 已把本仓 `engine.json` 改为显式清单；配置与真实预览说明见 `apps/Cocos/README.md` | 首版按 SD11 开启 `custom-pipeline` + `custom-pipeline-builtin-scripts` + `custom-pipeline-post-process`，关闭 `legacy-pipeline` 与 physics；⛔ 自研 pass |
| 渲染管线 | `custom-pipeline` 扩展（GBuffer / 延迟光照 / TAA / FSR / bloom / 雾），`project.json` 指向自定义管线资产 | **引擎内置新管线**（`custom-pipeline` + `custom-pipeline-builtin-scripts` + `custom-pipeline-post-process`，引擎维护；3d.md SD11）；后处理只用其自带开关；⛔ 自研 pass | 演示项目的重点是自研管线，本仓的重点是 kit 能消费；WebGL1 / 小游戏下可用性 SC0 实测 |
| 目录 | `assets/res`（静态引用，545 MB）vs `assets/resources`（动态加载，179 MB）；`scene-development/` 十个特性场景；`test/`；`LightFX/` 烘焙产物 | 本仓一切动态加载：小数据与框架灰盒在 `resources/`，3D 重资产**每包一个 bundle**（`apps/Cocos/assets/bundles/<class>-<id>/`，3d.md SD12），按包分命名空间（§2）；框架 `stage3d-dev.scene` + kit 验收场景 | 本仓没有「静态引用整场景」的形态，页面即入口 |
| 场景组织 | `scene.scene` 是 8 节点骨架；城市全在 `resources/prefabs/scene-root.prefab`（2,881 个 MeshRenderer，分 `lights / mesh-root / meshes-no-culling`）+ `mesh-details.prefab`（336 个，`fullScene` 画质门控才加载）；`DelayActive` 分帧激活 | 采纳：Stage3D 租约 `root` 下挂 kit 的内容 prefab，分 **base / details** 两层，details 按画质档加载；`EntityPool` 每帧激活预算（§7） | 同构 |
| LOD | 离线：`res/meshes/<SM_x>/lod_{0,1,2}.gltf`（497 套，由管线扩展的 `StaticAreaBatch` 合批 + `saveGltf` 生成，`SwitchLod` 编辑器工具整体切档）；运行时 **⛔ 无** `LODGroup`、无距离 LOD | 采纳离线变体（`tools/art3d` 用 meshopt 生成 `lod_1 / lod_2.glb`）+ 运行时两级档由 `EntityPool` 按 `lodBands` 选择（§7） | 本仓有相机缩放 ⇒ 需要运行时按档切换资产，但仍是「选资产」不是「算 LOD」 |
| 材质 | 259 个 `.mtl`：178 用 `custom-surface.effect`（surface shader 形态，PBR：albedo / normal / pbrMap(ORM) / emissive）；364 个 pass 开 `USE_INSTANCING`；359 个带 `HAS_SECOND_UV`（烘焙 UV2）；命名 `MI_*`（Unreal 材质实例遗留）+ 开发用 `mat-*` | 缺省 `builtin-standard` PBR 贴图集；静态世界材质缺省开 instancing；自写 shader 用 surface shader 形态；命名 `M_<Asset>[_<Variant>]`（§4） | 同构，改命名 |
| 贴图 | 685 张：552 texture / 127 sprite-frame / 6 cube；512² 占 323、1024² 90、2048² 12（主角）；非 POT 155（UI）；压缩预设 `astc_8x8 medium` + `png 80`（android / ios / web 同）只用在 `resources/textures`（325）与反射探针，UI / VFX / lightmap / 天空图不压；mip 多数关（599 none / 91 linear）；wrap repeat + linear；aniso 0 | 采纳尺寸档、预设与「不压」范围；**mip 缺省开**（§5 理由） | mip 是本仓自定 |
| 光照 | 全烘焙：`ModelBakeSettings` 10,860 处、`StaticLightSettings` 460 处、LightFX 输出 11 张 lightmap（1.8 MB）；运行时 `shadows._enabled:false`，3,593 个 MeshRenderer `_shadowCastingMode:0`（仅 8 个开）；366 点光 + 62 聚光 + 32 方向光全静态；HDR 天空 + 卷积做 IBL；3 个烘焙反射探针 | 采纳：静态光烘焙、运行时阴影缺省关、天空 HDR + 卷积、反射探针按需（§6） | 同构 |
| 相机 / 层位 | 两台透视相机（fov 45 / 90，clear SOLID_COLOR）；自定义层 `FPS(1) / MOTION(2) / RENDER-ID(4)` 在 `project.json` 声明；render-id 层做 GPU 拾取与静态遮挡 | 层位必须在 `project.json` 声明（3d.md §3.1）；拾取首版用射线（`pickMath`），render-id 留作选项 | 本仓要叠在 UI 正交相机之下，形态不同 |
| 动画 | 主角 / 敌人：Marionette 动画图 9 个 + 遮罩 3 个、`AnimationController` 21 处、`SkinnedMeshRenderer` 68 处、实时蒙皮（`useBakedAnimation` 仅 1 处开）；同屏敌人 ≤ 4（`maxEnemies`）；FBX 动画按 `animationImportSettings` 切 clip；`mountAllAnimationsOnPrefab:true` 1,373 / 1,374 | 少量主角走 Marionette + 实时蒙皮；大批量单位走预烘焙 + instancing（`SkinnedUnits`）；导入选项同 Cyberpunk 缺省（§8） | 本仓单位数量级不同 |
| 特效 | 262 个 `ParticleSystem`；`res/effect/<fx_name>/` 一目录一特效（prefab + 自有 mtl + png，74 mtl / 63 png / 34 prefab）；`ResPool` 池容量来自 `data-pool.json`（如 `fx_hit_*: 30`）；`fx.ts` pop → lookAt → emit play | 采纳目录形态与数据表池容量；播放归框架 `Vfx`（§9） | 同构 |
| 物理 | PhysX 模块；477 盒碰撞 / 13 胶囊 / 18 刚体 / 0 网格碰撞；分组与矩阵在 `project.json` | 首版不开物理模块；需要时同法（简单碰撞体 + 分组矩阵归框架 settings，§10） | SLG 俯视地图无碰撞需求 |
| 画质分档 | `HrefSetting`（URL 参数覆盖）+ `gpu.ts` GPU 评分表（移动 / PC 两张表，可按 GPU 型号强制）→ shadingScale / bloom / fxaa / taa / fsr / fullScene / maxEnemies / sceneParticles；`data-quality.json`（fps 上限 / 物理子步 / IK） | 采纳形态：`qualityTiers.ts` 查表（⛔ 不引第三方 detect-gpu）+ `quality.json` 数据表 + dev URL 覆盖（§11） | 去掉管线特有开关 |
| 资源管理 | `Res` 包 `resources.load`；`ResCache` 按 `data-res-cache.json` 目录清单**全量预载**；0 处 `addRef / decRef / releaseAsset` | 预载清单数据表采纳；持有与释放改 `AssetLease`（§12） | 演示项目不释放；本仓页面切换必须释放 |
| 基线设备 | Android：麒麟 970 / 骁龙 835；iOS：A10 | SC4 选机参考，未认定手机下限（§15） | SC0 桌面基线为实际 Apple M4；真机另验 |
| 授权 | 内容许可协议：仅限个人学习研究，⛔ 分发 | ⛔ 任何 Cyberpunk 文件不得进仓（§14） | — |

## 2. 目录与命名

### 2.1 目录（三个命名空间，与 3d.md §2 划线一致）

| 归属 | 源（作者态） | 运行时（Creator 导入产物 + `.meta`，随目录提交） |
| --- | --- | --- |
| 框架 | `tools/art3d/greybox.py` 合成 | `apps/Cocos/assets/resources/stage3d/`（灰盒、夹具、验收场景用；与 `resources/ui` 同级） |
| kit | `apps/kits/<id>/art/3d/`（`*.glb`、`*.png`、`art3d.config.json`、`LICENSES.md` 授权台账、材质映射表） | 重资产：`apps/Cocos/assets/bundles/kit-<id>/3d/{models,textures,materials,effects,vfx,anims,spine}/`（每包一个 bundle，可按地图 / 场景细分 `bundles/kit-<id>-<map>/`）；小数据表：`apps/Cocos/assets/resources/kits/<id>/3d/data/` |
| 插件 | `apps/plugins/<id>/art/3d/` | `apps/Cocos/assets/bundles/plugin-<id>/3d/…` + `resources/plugins/<id>/3d/data/`（同形） |

- 运行时目录 ⛔ 不是源目录的逐字节镜像（含 Creator 子资产与 `.meta`）；源目录只放可再生成的输入。
- **bundle 策略（3d.md SD12，2026-09-19 拍板）**：`resources/` 仍是小数据与框架灰盒的 bundle；kit / 插件 3D 重资产**每包一个 bundle** `apps/Cocos/assets/bundles/<kit|plugin>-<id>/`（目录 `.meta` `isBundle:true`；开发期 `isRemote:false`，发布按平台在 `builder.json` bundleConfig 覆写为 `isRemote:true`，压缩类型候选 `merge_dep`），可按地图 / 场景细分为 `bundles/<class>-<id>-<map>/`；目录名须精确归属一个包，⛔ 用 `<class>-<id>*` 裸前缀推导所有权，细分 bundle 归属按包身份推导，只有精确 `<class>-<id>` 或非空 `<class>-<id>-<map>`（`<map>` 匹配 `^[a-z][A-Za-z0-9]*$`，`<class>` ∈ {kit, plugin}，3D-40）后缀可归属；根目录 `.meta` 同规，详见 3D-PLAN SC1-B7；Asset Bundle ⛔ 嵌套在 `resources/` 内 ⇒ ⛔ 把 3D 重资产放 `resources/{kits,plugins}/<id>/`；包所有权 / 锁 / 安装 / check 在 SC1-B7 扩到 `bundles/`，SC1-B5 的 `verify:assets3d` 复用其引用检查核心；`AssetLease` 以「bundle 名 + 路径」寻址，kit 代码不感知来源。
- 每个模型一目录：`models/<SM_Asset>/{SM_Asset.glb, lod_1.glb, lod_2.glb}`（Cyberpunk `res/meshes/<SM_x>/lod_{0,1,2}.gltf` 同法，主文件即 lod_0）。

### 2.2 命名

| 类型 | 规则 | 例 |
| --- | --- | --- |
| 静态网格 | `SM_<Asset>[_<Variant>].glb`；LOD 变体固定名 `lod_1.glb` / `lod_2.glb` | `SM_Lighthouse_A.glb` |
| 蒙皮角色 / 单位 | `SK_<Asset>.glb`（含骨骼、蒙皮、动画轨） | `SK_Marine.glb` |
| 贴图 | `T_<Asset>_<通道>.png`；通道：`_BC` 基色、`_N` 法线、`_ORM` 遮蔽 / 粗糙 / 金属打包（= Cocos `pbrMap`）、`_E` 自发光、`_M` 遮罩；UI 仍用既有 `img_ / ui_` | `T_Lighthouse_A_ORM.png` |
| 材质 | `M_<Asset>[_<Variant>].mtl`；共享材质 `materials/common/M_*` | `M_Sea_Deep.mtl` |
| 自写 shader | `<kit>-<name>.effect`（surface shader 形态） | `lvr-sea.effect` |
| 特效 | 目录 `vfx/FX_<name>/`，内 `FX_<name>.prefab` + 自有 `M_FX_*.mtl` + `T_FX_*.png` | `vfx/FX_HitSpark/` |
| 动画 | clip `ANIM_<Asset>_<动作>`（导入切分名）；动画图 `ANIG_<Asset>.animgraph`；遮罩 `MASK_<Asset>_<部位>.animask` | `ANIG_Marine.animgraph` |
| 预制 | 与主资产同名（导入自动生成）；组合预制 `P_<Kit>_<Thing>.prefab` | `P_Lvr_CityBase.prefab` |
| 数据表 | `data/{art3d.config,preload,pool,quality,detail-layers}.json` | — |

前缀 ⛔ 不带 `mmo / lvr / slg` 等包名（目录已表归属）；包名只出现在自写 `.effect` 文件名与组合预制的 `P_<Kit>_`。

## 3. 模型

| 项 | 规则 |
| --- | --- |
| 格式 | 交换格式 **glTF 2.0 二进制 `.glb`**（Creator 作者态导入为 Mesh / Material / AnimationClip / Skeleton / Prefab 子资产）；**FBX 只作例外**（DCC 直出角色蒙皮 / 动画在 glb 有损时），须在 `art3d.config.json` `exceptions[]` 登记文件与理由；⛔ 不入库 `.blend / .max / .ma` 源文件 |
| GLB 图片与依赖 | ⛔ `images[].bufferView` 内嵌图片或 `data:` URI；`tools/art3d` 在入库前把图片外提 / 转换成同包独立 PNG，`images[].uri` 只允许相对引用本包资产根内的图片（框架样本限 `resources/stage3d/`）。规范化 URI 并解析实际路径后不得跨包、越界、指向远程 URL 或缺失文件；图片逐份走 §5、预算与授权检查。几何 buffer 使用 GLB BIN chunk，⛔ 外部 `buffers[].uri`。Creator 导入后的图片 / texture 子 `.meta` 同样受检，不能只查 GLB 顶层 `.meta`。⚠ Creator 3.8.8 对「二进制 glb + 外部图片 uri」的导入行为在 SC0-B2 实证（3D-38）；未通过则退路为 `.gltf + .bin` 或允许内嵌，并同步改本行与 §13 |
| 坐标 | 米制、Y 上、右手系；静态物件枢轴在底部中心，角色枢轴在脚底；正面朝 `-Z`（Cocos `Node.forward`）；导入不缩放（`scale = 1`） |
| 网格 | 三角化；单网格 ≤ 65k 顶点（16 位索引）；静态世界网格带 **UV2**（烘焙用，Cyberpunk 359 个材质 `HAS_SECOND_UV`），UV2 在 DCC 做（`generateLightmapUVNode:false`）；法线 / 切线随文件带（法线贴图需要切线） |
| LOD 变体 | 主文件 = lod_0；`lod_1.glb`（≈ 1/4 面）/ `lod_2.glb`（≈ 1/10 面）由 `tools/art3d`（meshopt simplify）离线生成或美术手做；同目录、同材质槽；工具必须报告各档面数、包围盒和材质槽并验证贴图引用。蒙皮变体还须保留骨架 / joints / weights / 动画轨并校验骨骼数与动画时长；不能保真的输入显式失败，改走登记的手工作品，⛔ 静默丢弃动画。SC5-B1 必须产出并导入两份 LOD，运行时由 `EntityPool` 按档选择（3d.md §4） |
| 导入选项（`.meta` `userData`，机检项） | `mountAllAnimationsOnPrefab: true`；`lods.enable: false`（LOD 由变体 + 档位管，⛔ 不用 Creator 内置 LOD）；静态网格 `allowMeshDataAccess: false`（工具场景需 CPU 读取时才开）；蒙皮网格保留 `true`：Creator 3.8.8 首次预烘焙播放须读取 JOINTS / WEIGHTS / POSITION 计算骨骼包围盒，关闭后会在 `Mesh.getBoneSpaceBounds` 抛错（SC0 实测；`mesh.ts` 的 setter 也明确只适用于静态网格）；蒙皮 CPU 数据计入资源预算；FBX：`legacyFbxImporter: false`、`smartMaterialEnabled: true`；`meshOptimizer / meshSimplify` 关（离线做）；`addVertexColor: false`（顶点色仅 slg 2D 地表那类显式需要时开） |
| 面数预算（§15 冻结的作者态上限） | 世界地图实体近档 ≤ 3k 三角、远档 ≤ 300；建筑 / 地标 ≤ 10k；主角 ≤ 20k；同屏总量 ≤ 500k（移动 medium 档） |
| 碰撞 | 渲染网格 ⛔ 不当碰撞体；需要物理时用盒 / 胶囊（Cyberpunk 0 个网格碰撞体），见 §10 |

## 4. 材质与 shader

| 项 | 规则 |
| --- | --- |
| 缺省效果 | `builtin-standard`（金属 - 粗糙度 PBR）；贴图槽：`mainTexture`（`_BC`）、`normalMap`（`_N`）、`pbrMap`（`_ORM`：R 遮蔽 / G 粗糙 / B 金属）、`emissiveMap`（`_E`）；数值参数 `metallic / roughness / occlusion / emissiveScale` |
| instancing | 静态世界材质缺省开 `USE_INSTANCING`（Cyberpunk 364 个 pass）；同网格同材质才合并 draw call，⛔ 每个实例一份材质实例（`MaterialInstance` 只用于极少数需要独立参数的物件） |
| 透明 | 只用 `transparent` technique；透明物 ⛔ 投影、⛔ 接收 lightmap；数量进预算 |
| 自写 shader | **surface shader 形态**（`CCProgram` 只覆写表面函数，复用 `standard-vs / standard-fs` 与光照模型，Cyberpunk `custom-surface.effect` 同法）；落 `bundles/kit-<id>/3d/effects/<kit>-<name>.effect`；管线为引擎内置新管线（SD11），surface shader 在其上原生可用；⛔ 覆盖 `builtin-*`；每个 `.effect` 必须能被 `builtin-standard` 替换而不崩（fail-soft 兜底材质） |
| 材质数量 | 一个模型一材质为缺省；共享材质进 `materials/common/`；材质数是 draw call 的下界，`--perf` 报告按材质计 |
| 贴图槽缺省值 | 缺法线用 `normal` 灰蓝、缺 ORM 用 `grey`（Cyberpunk 缺省）；⛔ 用 1×1 自制占位贴图 |

## 5. 贴图

| 项 | 规则 |
| --- | --- |
| 源格式 | `png`（8 位 RGB / RGBA）；HDR 天空 `.hdr`；⛔ 入库 ASTC / ETC / KTX 压缩纹理（平台压缩交 Creator 构建） |
| 尺寸 | 3D 贴图一律 **POT**；档位：256（小件 / 远档）、**512 缺省**、1024（地标 / 主角身体）、2048（仅主角面部 / 发丝等，需登记）；非 POT 只允许 UI |
| `.meta` 导入 | `type: texture`（⛔ sprite-frame）；`wrapMode` 平铺贴图 `repeat`、图集 `clamp-to-edge`；`min / mag: linear`；**`mipfilter: linear`**（3D 世界贴图缺省开 mip；Cyberpunk 599 张关 mip 是低端机显存取舍，本仓相机有连续缩放，关 mip 会闪烁——显存吃紧时按档降尺寸而不是关 mip）；`anisotropy: 0`；法线 / ORM 标 linear（非 sRGB） |
| 压缩预设（`builder.json` `textureCompressConfig`，框架维护） | `3d-default`：android / ios / web / 小游戏 `astc_8x8 quality medium` + `png quality 80` 回落（Cyberpunk 同款）；`3d-alpha`（UI 图集 / 特效 alpha 渐变）：`astc_6x6` 或不压；lightmap / 天空图 / 反射探针 ⛔ 压缩；`3d/textures/**` 的 `.meta` 必须引用 `3d-default` 或 `3d-alpha`（机检） |
| 体积 | 单张 ≤ 4 MB png；kit `3d/textures/` 总量进 `art3d.config.json`（冻结上限 32 MB） |
| 图集 | 特效小图集在 DCC / `tools/art3d` 拼成 1024²；⛔ 依赖 Creator 动态图集处理 3D 贴图 |

SC0-B5 的唯一采样例外登记在 [sc0-asset-exceptions.json](../tools/art3d/sc0-asset-exceptions.json)：
只允许该清单精确路径、ImageAsset / Texture2D UUID、PNG 与 `.meta` SHA 同时匹配的
`LFX_Mesh_0000.png` 保留 `mipfilter:none`、`wrapModeS/T:repeat`，用于复现本次 Creator 3.8.8
官方 LightFX 烘焙及默认导入的结果；这不是所有 lightmap 的通用规则。POT、min / mag、预算与
不压缩要求仍须满足。当前证据仅覆盖相机 `(7,7,7)` 看向 `(0,0.4,0)`、FOV 45、
375×812 CSS / DPR 2 的固定距离；128² 分配区域映射 126²，图块边界约 1 texel，
不能据此保证 UV 岛内部或整条 mip 链的 padding。烘焙 `filter:true` 不代表生成 mipmap，
整张图集 clamp 也不能防止内部图块串色。连续缩放、远距离及 mip 链保真未验；若改采样或重新
烘焙，须重新核对哈希、UV / padding、Creator 导入与独立预制画面，不自动沿用本次例外。

## 6. 光照与环境

| 项 | 规则 |
| --- | --- |
| 静态光 | 方向光 + 点光 / 聚光标 **static**（`StaticLightSettings`），在 Creator 光照烘焙（LightFX）里烘进 lightmap；lightmap 产物随内容预制的 `ModelBakeSettings` 引用入库。SC0-B5 用框架灰盒在验收场景烘一次 → apply 回**独立 `.prefab`** → 关闭 / 卸载烘焙场景 → 预览从已登记路径动态加载该预制，验证烘焙纹理 / UV2 引用及实际照明仍成立，证据含前后截图与引用检查；只在烘焙场景内看见光照不算通过。kit 后续沿用此工作流，产物与预制放同包 bundle |
| 运行时阴影 | 缺省 **关**（`shadows.enabled:false`）；只给主角 / 少量动态单位开 `ShadowMap` 或平面阴影，且由画质档控制；⛔ 静态建筑运行时投影 |
| 环境光 / IBL | 天空 HDR（`.hdr`）+ Creator 卷积产物（Cyberpunk `sky-cubemap/0.hdr` + `0_convolution`）；`ambient` 取自天空；经 `lease.setGlobals({ skybox, ambient })` 设置 |
| 反射探针 | 按需烘焙（Cyberpunk 3 个），产物 png 进预算，`.meta` 按 §5 不压缩 |
| 雾 / 后处理 | 只用引擎 `fog` / `postSettings`（toneMapping）经全局设置租约；⛔ 自定义管线后处理（3d.md SD11） |
| 产物体积 | lightmap 单张 ≤ 2048²、总量进预算（Cyberpunk 全城 11 张共 1.8 MB） |

## 7. 场景组织、LOD 与细节层

```text
Stage3D 租约 root
├── base（必载）：地表 / 海面 / 主体建筑 / 地标 —— 由 chunkStreamer 按视口分块加载（lvr）或整包加载（小场景）
├── details（画质门控）：装饰 / 小件 / 氛围灯 / 环境粒子 —— medium 起加载，low 不加载（Cyberpunk mesh-details 同法）
└── entities（EntityPool）：单位 / 军队 / NPC —— 两级档：近档 SK_/SM_ 主文件，远档 lod_1 或公告板；每帧激活预算
```

- **LOD 的三个层次**：① 离线变体（美术 / 工具产出 `lod_1 / lod_2`）；② 运行时按 `lodBands` 档选变体（`EntityPool.setLod`）；③ 细节层按画质档门控（`detail-layers.json` 声明每个预制属 base 还是 details，及 `hideAtLod`）。⛔ 运行时合并网格、⛔ `LODGroup`。
- **分帧激活**：大批 spawn 排队，每帧 ≤ N 个激活（Cyberpunk `DelayActive` 的分帧思想），N 按档给。
- **视口外**：`chunkStreamer` 差分 + `assetPlan` 出档延迟释放（冻结缺省 5 s，SC3 实装）。
- **场景文件**：3D 内容 ⛔ 直接摆进 `scene.scene`（框架场景零改动）；kit 只交预制。

## 8. 角色与动画

| 项 | 规则 |
| --- | --- |
| 少量主角 / 近景 | Marionette 动画图（`ANIG_*.animgraph` + `MASK_*.animask`）+ `SkinnedMeshRenderer` 实时蒙皮（Cyberpunk 主角 / 敌人同法）；引擎模块 `marionette` 必须勾选 |
| 大批量单位 | 框架 `SkinnedUnits`：`SkeletalAnimation.useBakedAnimation:true` + instancing（3d.md SD3）；动画只允许「切 clip」，⛔ 混合 / IK。同模型 / 同材质只是必要条件，还须共享兼容的 `jointTexture` 与实例数据布局；框架按有效关节贴图与布局分批，或预先把该批模型 / clip 布置进同一 joint-texture atlas，⛔ 仅按 prefab / 材质键合批（3D-42） |
| 蒙皮路径与退化 | 实时蒙皮材质必须关闭 instancing（包括少量主角与低档退化路径）；浮点纹理不支持 ⛔ 不等于预烘焙不可用，先验证 Creator 的 RGBA8 关节纹理回退及实际采样能力，只有烘焙路径确实不可用或超预算时才切受数量限制的实时蒙皮 / 公告板。SC0 / SC4 证据覆盖同模型多 clip、跨 atlas、切 clip 后重分批、浮点 / RGBA8 路径，既验画面也验 draw call，⛔ 单 clip 同材质样本替代（3D-42） |
| 导入 | `mountAllAnimationsOnPrefab:true`；FBX / glb 内多动作用 `animationImportSettings` 切分并命名 `ANIM_<Asset>_<动作>`（Cyberpunk 的 `Unreal Take` 切分同法）；帧率 30 |
| 骨骼 | 单位 ≤ 30 骨、主角 ≤ 80 骨；蒙皮每顶点 ≤ 4 权重 |
| 2D 骨骼 | Spine **4.2**（工程级单选，3d.md SD5）；`.json / .atlas / .png` 三件放 `3d/spine/<name>/` |
| Timeline 式演出 | 首版 `tween` + 动画图事件；⛔ 引第三方 |

## 9. 特效

| 项 | 规则 |
| --- | --- |
| 形态 | Creator `ParticleSystem` 预制；**一目录一特效** `vfx/FX_<name>/`（prefab + 自有材质 + 贴图，Cyberpunk `res/effect/<fx>/` 同法）；Unity ParticleSystem ⛔ 不能转，逐个重建 |
| 播放 | 只经框架 `Vfx` 池（pop → 定位 / 跟随 → play；定时回收；按档禁用；同键并发上限）；⛔ kit 自己 `instantiate` 特效 |
| 池容量 | `data/pool.json`（`FX_<name>: n`，Cyberpunk `data-pool.json` 同法；高频命中类 30、稀有 2–5） |
| 预算 | 单特效 ≤ 200 粒子、≤ 2 材质；同屏特效数按档（冻结调度上限 low 8 / medium 24 / high 48，容量验收见 §15） |
| 贴图 | 特效图集 `T_FX_<name>.png` 用 `3d-alpha` 预设或不压 |

## 10. 物理与碰撞

- 首版**不勾选物理模块**（SLG 俯视地图、MMO 首版移动用服务端积分与网格候选，都不需要客户端刚体）。
- 需要时（如 lvr 主城点选、投射物）：`physics-builtin`（轻）或 `physics-physx`；碰撞体只用盒 / 球 / 胶囊，⛔ 网格碰撞；碰撞分组与矩阵在 `project.json`（框架 settings，kit 提需求）；物理材质 `.pmtl` 归 kit。
- 拾取首版用射线数学（`pickMath`），⛔ 为拾取开物理。

## 11. 画质分档

| 档 | 判定（`qualityTiers.ts` 查表；⛔ 第三方 detect-gpu） | 内容 |
| --- | --- | --- |
| low（**首版目标**，3d.md SD10；首发消费方 `lvr`，lvr-3d.md R0） | 微信小游戏 / WebGL1 / 未知移动 GPU / 命中黑名单型号 | 只 base 层；无实时阴影；特效并发 8；同屏单位 50；贴图由运行时资产计划按quality×LOD选离线降一级贴图变体，网格LOD仍按原距离规则（§15.1，SC3 实装）；先验证预烘焙关节纹理的浮点 / RGBA8 路径，实际不可用或超预算才退化为禁 instancing 的实时蒙皮上限 + 公告板远档；instancing 不可用时降低单位 / 绘制预算，ASTC 不可用时 png 回落（体积按回落计） |
| medium | 主流移动 GPU（Adreno 6xx / Mali-G7x / Apple A12+ 候选） | base + details；主角阴影；特效 24；单位 100 |
| high | 桌面 / 高端移动 | 全部；阴影 ShadowMap；特效 48；单位 100（本轮收敛后的初始上限，扩容须重验） |

- 档位表 `data/quality.json`（Cyberpunk `data-quality.json` 同法：fps 上限、每档开关）；dev 下 URL 参数 `?quality=low&shadows=0` 覆盖（Cyberpunk `HrefSetting` 同法）；`--perf` 报告必须标注档位与设备。
- 档位由框架 `quality` 给出（3d.md §4），kit 只消费 `ports.stage3d.quality`。

SC1-B8 的数据契约与示例见 [tools/art3d/quality.md](../tools/art3d/quality.md)：`quality.json` 为框架默认政策真源，`pool.json` 描述逐帧激活预算与各档容量，`detail-layers.json` 明确 base / details 归属及 quality × LOD 纹理地址。实际加载、细节层门控和激活队列由 SC3 消费；本批仅交付契约、校验及画质判定。

## 12. 加载、缓存与释放

| 项 | 规则 |
| --- | --- |
| 持有 | 只经 `AssetLease.acquire(requests, { deadlineMs, signal })`；页面关闭先解除场景 / 全局 token 引用，再释放本页租约；池内 inactive 节点持有资产直到淘汰销毁，其他有效 token 不受影响；迟到完成仍 decRef |
| 预载 | `data/preload.json` 目录清单（Cyberpunk `data-res-cache.json` 同法），在页面 `onOpen` 里一次 `acquire`，⛔ 全局常驻（Cyberpunk 的永不释放 ⛔ 不学） |
| 分块 | 世界内容按 `chunkStreamer` 差分 + `assetPlan` 计划加载 / 延迟释放；进档只加载该档变体 |
| bundle | **每包一个 bundle**（3d.md SD12）：`bundles/<class>-<id>/`，可按地图 / 场景细分；开发期本地、发布远程（SD12）；`AssetLease` 以「bundle 名 + 路径」寻址，`data/preload.json` 按 bundle 分组，首屏必需集合单独一个小 bundle；kit 代码零改动 |
| 缓存诊断 | `--perf` 报告带 `memoryStatus.{bufferSize,textureSize}`、业务租约 / 节点计数；先预热该剧本的模型、clip 与特效，再以所有业务持有释放后的稳定值为基线，按相同剧本开关 20 次不得持续增长。引擎关节纹理 atlas / 内部池的高水位缓存可留存，但必须记录归属、预热范围与稳定值；业务引用须归零，⛔ 用「引擎缓存」解释未释放租约，⛔ 要求引擎缓存恢复首次加载前的冷启动值（3D-42） |
| 性能计时 | 帧率与 p50 / p95 / max 用相邻真实引擎帧的单调时钟时间戳差（raw wall frame interval，保留原始样本），与该帧 draw call / 三角数对齐；`director.root.frameTime` 只能作附加诊断，⛔ 单独充当帧率证据。报告记录时钟 / 单位 / 帧号、前后台切换与样本有效性；后台限频等无效窗口重跑，前台卡顿不能过滤掉（3D-45） |
| 微信持久缓存 | SC4-B3 与 lvr A3 必须使用**真实微信客户端**验远程 bundle 的冷缓存下载，随后实际触发缓存写入失败，观察失败后的 LRU 淘汰 / 清理、重试、重新访问与退出重启后的命中或必要重下载。记录平台实际存储容量 / 限制、可复现的填满或触发失败步骤及真实错误、机型 / OS / 微信 / 基础库版本、构建与 bundle 版本、网络请求与缓存命中证据；⛔ 假设存在某个引擎可配置容量开关，⛔ 仅「接近满」却未触发失败就算覆盖。要求失败恢复与重试按预期完成，否则不得退出（3D-47） |

## 13. 入库流程与验收

```text
作者 / 工具 → apps/kits/<id>/art/3d/（glb / png / config / 授权台账）
  → 按 §2.2 命名、§3 / §5 规则整理（tools/art3d：extract → textures（外提图片为独立 PNG）→ to-gltf → lod（产出 lod_1 / lod_2）→ material-map → verify-roundtrip）
  → Creator 导入到 bundles/<class>-<id>/3d/**（小数据表到 resources/<class>s/<id>/3d/data/；生成 .meta 与子资产；导入选项按 §3 / §5 缺省，压缩预设按 §5）
  → kit 验收场景（Creator）目检：拖入预制、三档 LOD、材质、透明排序；烘焙 apply 回独立预制后，卸载烘焙场景并动态加载验证照明（SC0 灰盒证据先行）
  → npm run verify:assets3d（机检，进 verify:all）
  → node tools/creator-preview/run.mjs <剧本> --perf（证据：raw wall frame interval / draw call / 三角数 / GFX 内存，口径见 §12，落 docs/evidence，不入库）
  → 提交（含 .meta；verify:sync 守 uuid 唯一）
```

`verify:assets3d` 机检契约（`scripts/verify-assets3d.mjs`，3D-PLAN SC1-B5；SC1-B7 接入 bundle 所有权 / 打包安装）：

| 检查面 | 必须覆盖 |
| --- | --- |
| 扫描与归属 | 扫框架 `resources/stage3d/**` 与包 `resources/{kits,plugins}/*/3d/**`（后者只允许 `data/` 小数据）；枚举 `assets/bundles/` 并按包身份核对精确目录边界，再扫包 bundle 及细分 bundle 的全部资产（必须位于 `3d/**`，目录 `.meta` 除外）。拒绝包重资产遗留在 `resources/`、无主 bundle 或多包归属；源侧 `apps/{kits,plugins}/<id>/art/3d/` 的配置 / 授权与运行时文件逐项映射 |
| 格式白名单 | `glb / fbx / png / hdr / effect / mtl / prefab / anim / animgraph / animask / json / atlas / skel`；FBX 须有 `exceptions[]` 文件与理由。`.meta` 是受检伴随文件，不要求再配 `.meta.meta`；作者态 `art3d.config.json` / `LICENSES.md` 是配置与授权输入，⛔ 因 Markdown 不在运行时资产白名单而拒绝合法台账 |
| Creator 导入 | 运行时每个资产及 bundle 根的 `.meta` 存在，`importer` 与真实格式匹配；按 Creator 3.8.8 导入样本校验顶层与 `subMetas` 的实际字段；顶层 uuid 唯一继续交 `verify:sync`，本闸另建子资产索引并检查重复 / 悬空子资产。GLB / FBX 的 texture 子资产也必须接受图片规则检查，⛔ 只按独立文件扩展名筛选 |
| GLB 结构与依赖 | 校验 glTF 2.0 头、声明长度、JSON / BIN chunk 长度与边界；解析 JSON 并拒绝内嵌图片（`images[].bufferView` / `data:`）、外部 buffer URI；图片相对 URI 经规范化与实际路径解析后必须落入本包资产根并存在，跨包 / 路径越界 / 远程 URI 均失败；独立图片全部进入后续检查 |
| Creator 序列化依赖与归属（3D-44） | 对 `.prefab / .mtl / .anim / .animgraph / .animask`、模型 `.meta / subMetas` 等按 Creator 3.8.8 序列化格式抽取外部资产 UUID 引用，规范化完整 / 压缩 UUID 与子资产标识，区分 `__id__` 对象内部索引；递归解析到实际文件 / 子资产并检查闭合。允许本包资产（含同包细分 bundle）及框架维护的精确资源 / 子资产 allowlist；引擎内置 effect / 默认纹理等在该 allowlist 单列，并钉引擎版本与可解析性，⛔ 因 UUID 看似内置而放行。`requires.kits` 仍只授权声明的 kit API，⛔ 自动放行被依赖 kit 的内部资源；kit→kit 依赖仍禁。本轮不新增跨包内容依赖机制。缺文件、缺子资产、跨包或引用未登记宿主资产均失败；相同检查复用到 pack / install 的落盘前校验，不能只依赖母仓完整资源树 |
| 贴图与压缩 | 校验实际图片格式、POT 与尺寸档（UI 例外须登记）；独立图片及导入 texture 子 `.meta` 的 `type`、wrap、min / mag、mipfilter、anisotropy、通道色彩空间均按 §5；采样例外按用途及精确文件 / UUID / SHA 核对，⛔ 以 lightmap 目录或文件前缀整体放行；`3d-default / 3d-alpha` 引用须在 `builder.json` 有对应平台与回落配置；lightmap / 天空 / 反射探针及获准不压的 VFX 须在配置标明用途并验证其不压设置，⛔ 目录改名即绕过压缩规则 |
| 模型与命名 | §3 所列模型导入选项（含 FBX 专有项）逐项等于缺省或有精确文件级例外；按 §2.2 检查目录、类型前缀、贴图通道后缀、LOD 文件名；灰盒固定文件名在框架配置显式声明，不以放宽所有命名规避 |
| 预算 | 读取包 `art3d.config.json`（框架用 `scripts/assets3d.config.json`）：单 GLB / PNG、全部贴图、lightmap 与包总量均须在配置限额内；外提图片和细分 bundle 必须计入同一包总量，重复引用只按实体文件计一次；运行时性能预算另由 `--perf` 提供证据。数字按 §15 冻结的政策上限；实际性能覆盖按 §15.2 与后续阶段证据判断 |
| 授权覆盖 | kit / 插件必须存在 `art3d.config.json` 与 `art/3d/LICENSES.md`；授权台账覆盖每份源素材、转换产物、外提贴图与 LOD 的来源映射，引用不能悬空；只查存在 / 覆盖，许可是否允许用途仍归人工（§14） |

SC0 的四个灰盒命名、64² 棋盘 PNG 尺寸与上述 LightFX 采样例外统一暂存于
[sc0-asset-exceptions.json](../tools/art3d/sc0-asset-exceptions.json)。确定性灰盒 manifest 仍记录
生成需求，不手改为实测通过；临时清单尚未接入自动资产闸。SC1-B5 须将其逐项迁移到正式配置并
实现匹配和拒绝用例，⛔ 因清单存在就声称 `verify:assets3d` 已实现。

正例：合法 `.mtl / .hdr / .animgraph / .animask` 应通过白名单。反例必须逐项转红：PNG 改名 `.jpg`、删除 `.meta`、删掉必需 texture 子 `.meta`、`mipfilter: none` 未登记、压缩预设引用不存在、模型 `lods.enable:true` 未登记、GLB 内嵌 PNG / JPEG、图片 URI 指向另一包或远程地址、GLB 外部 buffer、授权漏一张外提贴图、下调预算到实际体积以下均失败。蒙皮须按实际 skin 与 JOINTS / WEIGHTS 属性识别，不能只看文件前缀；关闭蒙皮 `allowMeshDataAccess` 必须失败，静态网格开启而无精确工具用途例外也必须失败。混合静态 / 蒙皮 GLB 如受同一文件级开关影响，登记该文件的保留理由与 CPU 数据预算；导入报告中的 native buffer 字节数仅为数据量下界，不代表总 CPU 内存。另验证相邻包 `foo` / `foobar` 不互认所有权，细分 bundle 的命名冲突必须拒绝；这些反例分别由 SC1-B5 / B7 验收，实现覆盖与证据以 3D-PLAN §8 为准；本节规范不单独表示完整资产闸已交付。

UUID 依赖正例必须含同包细分 bundle 间引用和已登记内置资源；反例覆盖不存在 UUID、父资产存在但子资产缺失、跨 kit / plugin 引用（含已声明 `requires.kits` 却直接引用该 kit 内部材质）、未登记宿主 / 验收场景资源。SC1-B7 把带 Prefab → 材质 → 贴图 / 模型子资产依赖链的合成包走 pack → 干净根 install → Creator 重导入 / 加载，移除母仓旁路资源后仍可解析；另验卸载无关包不破坏该链。`verify:sync` 的顶层 UUID 唯一性和包内路径所有权都不能替代本项（3D-44）。

SC5-B1 工具验收还须执行离线简化：主模型 → `lod_1.glb / lod_2.glb` → 三档 Creator 导入与夹具显示，往返报告列出每档面数 / 包围盒 / 材质槽 / 贴图依赖；蒙皮样例另外校验骨架、权重与动画时长。面数未下降、材质槽错位或适用动画数据丢失应失败，⛔ 只跑主模型往返即可冻结 SC5。

## 14. 授权

- **Cocos Cyberpunk**：其内容许可协议（`licenses/`）仅授权个人学习研究，⛔ 分发 / 二次开发外传；本仓只吸收做法与数字，**任何 Cyberpunk 文件（模型 / 贴图 / 材质 / shader / 脚本）⛔ 不得进仓**，提交前 `git diff` 里出现 `SM_CornerBuilding / MI_ / custom-surface` 等 Cyberpunk 命名即视为事故。
- 每个 kit / 插件的 `art/3d/LICENSES.md`：文件 → 来源 → 许可 → 允许用途 → 转换步骤（snake 素材授权台账同规格）；`verify:assets3d` 只查存在与文件覆盖，许可判断归人。
- 合成灰盒（`tools/art3d/greybox.py`）零授权；逆向来源（`../sourceVersion/*`）按各自全记录的授权口径，转换产物同样登记。

## 15. SC0 冻结预算（2026-09-22）

### 15.1 源资产与运行时预算

本表冻结 v1 的**入库政策与初始调度上限**，供 SC1 的配置和检查器、SC3 的加载计划及池、SC4 的蒙皮与特效消费。
体积按十进制 MB（1 MB = 1,000,000 B）计；同一物理资产只计一次，外置 PNG、lightmap 及同包细分 bundle
均计入所属包总量；`.meta` 的字节另列。现有灰盒低于这些限制，不能据此声称所有上限均已压测。
真实运行覆盖单列 §15.2；SC3 / SC4 的容量、退化和真机门继续执行。调整本表数值须记录依据并回写 3d.md §10。

| 项 | 冻结值 | 依据与后续验收 |
| --- | --- | --- |
| 包源资产总量 / 单 GLB / 单 PNG | 64 MB / 8 MB / 4 MB | 沿用 v1.5 的入库上限；当前7份源资产合85,679 B，SC1-B5/B7 实施边界与越限反例 |
| 包 `3d/textures/` 总量 | 32 MB | 沿用作者态限制；lightmap 即使不在此目录，仍计入包总量；不等同 GPU 内存 |
| 面数：世界实体近 / 远、建筑、主角 | 3,000 / 300、10,000、20,000 三角 | 作者态上限；当前网格最高96三角，复杂网格须在 SC3/SC4 内容夹具验证 |
| 同屏总面数 | medium 500,000 三角上限 | 调度预算；当前全场实测峰值16,068，移动端容量未获证明 |
| 贴图尺寸档 | 256 / 512缺省 / 1024 / 2048登记 | 保留 POT、mip 与精确例外规则；当前实际64²棋盘及1024² lightmap，其他尺寸不能记作已实测 |
| low 贴图降档 | 由资产计划按quality×LOD选离线降一级贴图变体，最低256档；网格LOD仍按原距离规则 | 选择原方案的离线变体路径；不依赖同一构建预设随运行时档位变化。SC1-B8 定数据形状，SC3-B2 验证选择及缺失处理，SC5 验工具保真 |
| 压缩预设 | `3d-default`: ASTC 8×8 / medium + PNG quality80回落；`3d-alpha`: ASTC 6×6或不压 | 保留既定制作策略；SC1-B8 实装/验证引用，SC4 验真实能力及PNG回落。lightmap/天空/反射探针不压缩 |
| 骨骼 / 权重 | 单位30骨、主角80骨、每顶点最多4个非零权重 | 作者态上限；当前只有2骨、每顶点1个非零权重，4分量槽不代表4权混合已验证；SC4/SC5补复杂骨架与权重证据 |
| 单特效 / 并发（low / medium / high） | 每个≤200粒子、≤2材质；并发8 / 24 / 48 | 初始调度上限；当前仅1个capacity50的ParticleSystem。SC4仍验100蒙皮+50特效及逐档退化 |
| 同屏蒙皮单位（low / medium / high） | 50 / 100 / 100 | high 原 `100+` 收敛到已测数量100；扩容须新证据。当前100为两骨灰盒，不能外推30/80骨容量；low真机仍等SC4 |
| 出档延迟释放 | 5 s | 沿用资源抖动控制策略；SC3-B2时钟/取消测试及SC3-B5资源实测验收 |
| 桌面基线 | Apple M4、ANGLE Metal、Chrome153、Creator3.8.8 WebPipeline；375×812 CSS / DPR2 | 当前可重放基线；麒麟970 / 骁龙835 / A10保留为SC4选机参考，未认定为可支持的手机下限 |

### 15.2 已验证负载与边界

完整数字、原始文件哈希、配置和移交索引见 [SC0 汇总](perf/stage3d/2026-09-22-sc0-review.json)。
60帧预热后采240帧，以 `240 × 1000 / 原始间隔总和` 计算实际平均fps；同时保留p95、max、启动窗口与长帧。
“桌面约60fps”记录实测吞吐，未定义或宣称每帧≤16.67 ms；后续阶段保持本口径并单独记录回归。

| 上下文（均为Apple M4桌面） | 平均fps | p95 / max ms | 启动max ms | 20次关闭后 |
| --- | --- | --- | --- | --- |
| WebGL2浮点 | 59.986503 | 18.7 / 20.6 | 120.5 | 业务引用0、夹具节点0、GFX增量0 |
| WebGL1浮点 | 59.980506 | 18.9 / 20.6 | 148.7 | 业务引用0、夹具节点0、GFX增量0 |
| WebGL1显式RGBA8能力故障注入 | 60.007501 | 18.8 / 21.6 | 126.6 | 业务引用0、夹具节点0、GFX增量0 |

负载为500立方体、100两骨蒙皮（多clip、跨实际关节纹理分批）及1个capacity50粒子系统。
三条路径预热及采样窗口（anchor+60warmup+240sample）的GFX峰值均为9 draw calls、16,068三角、650 instances、41,974,400 B；
instances 包含粒子等，全场GFX也包含宿主页，均不能当作单个单位开销或手机显存预算。
两份蒙皮的CPU native数据各15,936 B，仅是保留数据量下界。

B5独立烘焙预制在WebGL2 / WebGL1的p95为18.7 / 18.5 ms，20次关闭后节点、引用和GFX回基线；
缺PNG的404→2×2替代纹理定位→解除拦截→1024²恢复已验证。其lightmap采样例外限原固定机位，
不覆盖连续缩放、mip链或UV岛padding。RGBA8注入和桌面WebGL1均不替代SC4真实微信验收。

## 16. 修订登记

- 2026-09-19 规范 v1：对照 Cocos Cyberpunk 实测（§1）成文；与 3d.md v1.1、3D-PLAN.md、lvr-3d.md v1.1 同批。
- 2026-09-19 v1.1：SD9–SD12 拍板回写（§1 管线 / 目录行、§2.1 bundle 目录、§4 shader 落点与管线、§11 low 档 = 首版目标、§12 bundle 策略、§13 流程）。
- 2026-09-19 v1.2：审阅修订：统一 SD11 开关与 SD12 资产目录 / 所有权口径；GLB 图片必须外提、跨包与外部 buffer 依赖拒绝；§13 对齐完整资产闸、子 `.meta` / 压缩 / 授权覆盖 / 预算及反例；补 SC0 烘焙 apply → 独立预制动态加载证据与 SC5 离线 LOD 退出。⛔ 仅修订规范，未实施能力、未冻结 §15 数字。
- 2026-09-19 v1.3：3D-38 glb 外部图片导入验证项（§3）、3D-40 细分 bundle 后缀正则（§2.1）。
- 2026-09-19 SD10 补拍：low 档首发消费方 = lvr（§11）。
- 2026-09-22 v1.4：按 3D-PLAN 3D-41–3D-45、3D-47 同步素材相关契约：蒙皮按 jointTexture / 布局分批与 RGBA8 回退、实时蒙皮禁 instancing；UUID / 子资产引用闭合与包归属、内置资源 allowlist 和干净安装反例；raw wall frame interval、预热后稳定内存基线；真实微信冷缓存 / 写入失败 / LRU / 重试 / 重启缓存退出门。⛔ 本次仅文档修订，未实施能力、未冻结候选值、未勾阶段完成。
- 2026-09-22 v1.5：按当前任务范围收窄验收项，保留源资产与运行时预算、WebGL1 目标及真实微信缓存证据；⛔ 仅文档调整，未实施能力、未冻结候选值、未勾阶段完成。

- 2026-09-22 SC0-B4：冻结 §15 的入库政策和初始调度上限，单列实测负载；high 单位数从100+收敛为100，low贴图选择离线变体，桌面基线按实际M4记录。未外推手机、复杂骨架、满容量贴图或多特效性能；后续SC3/SC4/SC5仍按原门验收。
