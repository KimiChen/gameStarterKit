# `lvr` kit 的 3D 场景管线 —— 需求文档

> - 日期：2026-09-18。状态：**需求 v1.3（2026-09-19），未开工**；⛔ 未实施任何 3D 能力。
> - 归属：本文是 [lvr.md](lvr.md) §9.1 拍板「走 B：自建 3D 管线，用 Cocos 的 3D 能力」之后拆出的独立需求，
>   **由单独的人/单独的排期实现**，⛔ 不占 lvr.md §7 的 100–200 人月核心工程估算。
> - 逆向源：`../sourceVersion/lvr-1.0.0/`（仓外，只读）。本文引用的类名与目录均为实测。
> - **2026-09-19 v1.1（对照 Cocos Cyberpunk 校正）**：R1–R8 与 §4–§7 按 [docs/3d.md](docs/3d.md) v1.1 与 [docs/3D-ASSETS.md](docs/3D-ASSETS.md) 改为**消费方口径**（框架给舞台 / 租约 / 纯数学 / 机械件 / 画质分档 / 工具骨架，本文只留内容、shader、特效、数值与授权）。三份预算边界：框架 SC0–SC5（[docs/3D-PLAN.md](docs/3D-PLAN.md)）、lvr 3D 内容（本文）、lvr 核心工程（lvr.md §7）。
> - **2026-09-19 v1.2**：随 3d.md SD12 / v1.3 对齐——运行时落点改 `apps/Cocos/assets/bundles/kit-lvr[-<map>]/3d/`（小数据表留 `resources/kits/lvr/3d/data/`）；主城 / 世界的 FGUI HUD 走框架 overlay 输入接缝（3d.md §3.3，SC1-B9），⛔ 自建输入仲裁。
> - **2026-09-19 v1.3**：docs/3d.md **SD10 拍板 lvr 为首发小游戏 / WebGL1 消费方**——新增 §3 R0 平台目标：框架画质 low 档为 lvr 必达档，A1–A5 每阶段附 WebGL1 证据、A3 加微信开发者工具证据；渠道 SDK / 打包 / 审核仍按 lvr.md §9.3 不做。
> - 治理：实施状态只在本文 §8 回写；⛔ 不进 plan-v5。
> - **2026-09-19 提升**：本文的框架侧内容已提升为框架级设计 [docs/3d.md](docs/3d.md)（Stage3D 舞台 / AssetLease / `logic/scene3d` 纯数学 / 机械件 / 资产闸 / `tools/art3d`，阶段 SC0–SC5）；本文降为 **lvr 消费方需求**：§3 R1–R8 的框架侧落点见 docs/3d.md §1.2，§4 表中的框架约束以 docs/3d.md §2 为准，§5 A0 并入 SC0。实施状态：框架段在 docs/3d.md §10，lvr 接入仍在本文 §8。

---

## 1. 为什么需要这份文档

Last Voyage: Rising 是 **3D 游戏**：主城是 3D 俯视角海岛、世界地图是 3D 海面、单位用 GPU skinning、
建筑有四态模型与特效、相机可自由缩放并按档切换细节。

而本仓客户端是 **全 2D**：UI 空间正交相机，`slg.md` 的框架勘察原话是「无 3D/自由相机/手势缩放先例」，
`apps/Cocos/assets/resources/kits/` 下只有 png 与 json，**仓内零 3D 资产先例**。

Cocos Creator 3.8 本身是完整 3D 引擎（`MeshRenderer` / `Material` / `EffectAsset` / 骨骼动画 / 后处理都在），
所以这**不是引擎能力缺口**，而是：**整条 3D 管线的设计、资产转换与踩坑成本，全部落在 `lvr` kit 这一侧，且没有先例可抄。**

⚠ 本仓唯一沾边的先例是 `apps/client/src/kits/slg/view/` 的四个 Renderer
（`SlgChunkRenderer` / `SlgTilemapRenderer` / `SlgDecorationRenderer` / `SlgFarLayerRenderer`）——
它们已经在用 `Material` / `EffectAsset` / 动态 Mesh / 材质销毁 / LOD / 后处理开关回滚，
但都是**2D 平面四边形批合并**，不是 3D 场景图。可以抄它们的**资源生命周期与批合并纪律**，⛔ 抄不到 3D 场景组织。
2026-09-19 起框架先例改为 docs/3d.md 的 `stage3dFixture` 与 `stage3d-dev.scene`（SC1）；场景组织 / LOD / 烘焙 / 画质分档的做法参照 Cocos 官方 Cyberpunk 演示（docs/3D-ASSETS.md §1 对照表），⚠ 其素材许可仅限学习研究，⛔ 不得复用任何文件。

---

## 2. 原作 3D 技术栈盘点（实测）

### 2.1 世界地图层：两级 LOD 的实体渲染

`csharp/Render/`（151 文件）是世界地图的渲染层，核心是一个**严格的三件套模式**：
每种地图实体都有 `Entity<X>` + `Entity<X>Lod0` + `Entity<X>Lod1`，共 **19 种实体 × 3 = 57 个类**
（另有 `Entity*` 相关共 68 个、`RMapEntity*` 数据侧 27 个）：

```
AllianceFlag  AllianceFortress  AllianceWarBuilding  AltarBuilding  Banquet  Burial
City  ConvenePos  CoordsFav  GvgBuild  LostMine  NpcBox  NpcGather  NpcTroop
PlayerTroop  ThroneWarBuilding  ThroneWarTower  UnitSeaExploreBuild  UnitTaskBuild
```

配套：`RMapEntityManager` / `RMapEntityModule`（实体装配与回收）、`ActorWrapper` / `LodActorWrapper`、
`WorldObscaleManager`（遮挡）、`ViewRect`（视口）、`TerritoryHelper`（领地着色）、`RMapLongTap`（拾取）。

LOD 控制：`LodActive` / `LodData` / `LodLayerMgr` / `LodScale` /
`MapUnitLodSetting{,Base,BelongType,Common,MarchLine,NpcTroop}`（7 个）/ `MapUnitLodStateEnum`。

### 2.2 主城层：三档细节状态机

`csharp/Render/CityState{MaxDetail,MinDetail,Zooming}.cs` —— 主城按相机缩放在三档之间切换：
最高细节（建筑完整模型 + 特效 + 岛民小人）、最低细节（简化模型/贴图）、缩放过渡态。
配套 `BuildingFactory` / `BuildingDyController` / `BuildingDyData` / `BuildingEffect` / `BuildingEffectMgr`、
`AllianceBuildingPlacer` / `AllianceBuildingCommonPlacer`、`CityTeleportManager`。

### 2.3 角色与动画

- **GPU skinning**：`csharp/GPUSkinning*.cs` **19 个类**（`Player` / `PlayerMono` / `PlayerMonoManager` /
  `Animation` / `Clip` / `Frame` / `Bone` / `Sampler` / `Material` / `Quality` / `ShaderType` /
  `CullingMode` / `WrapMode` / `AnimEvent` / `PlayerJoint` / `PlayerResources` / `Util` / 两个容器类）。
  这是**把骨骼动画烘到贴图、在 shader 里采样**的方案，用于世界地图上的大批量单位。
- **Spine**：英雄立绘与战斗表演，bundle 命名 `assets.k1.k1d1.res.anims.herospine.hero_lh_<id>`。
- **Timeline**：`assets.newgamedemo.res.timeline` / `timelinecommon`，剧情与技能演出。
- **DOTween**：全局补间。
- 其它：`UpdateHeroHpRotPosByObject` / `UpdateUIPosFollowObject` / `HPForeGroundHandler`（3D 跟随 UI）。

### 2.4 材质与 shader

| 能力 | 原作实现 |
| --- | --- |
| 海面 | `BigWorldSeaMultiTexCameraHeightBlend.cs`（多贴图按相机高度混合） |
| 阴影 | `FastShadowReceiver/`（52 文件）+ `DynamicShadowProjector/`（9 文件）+ `PlanarShadow.cs` + `C5Shadow.cs` |
| 云 | `CloudEffectHandler.cs` + `MapCloudManager.cs` |
| 轮廓 | `BetterOutline.cs` |
| 地形 | `TerrainGridLevel.cs` + `StoneVolumeSetter.cs` |
| 描边/切换 | `SwitchEffect.cs` / `ScrollImageUV.cs` |

### 2.5 特效（VFX）

`csharp/Render/Effect{,Base,BaseManager,Manager}.cs` + `BEffectArgs` / `BEffectTimeLineData` +
`BuildingEffect{,Mgr}` + `DelayEffect` / `DelayDestoryTrigger`。
资产侧规模：`vfxbaseres` **265 个 bundle**、`vfxheroskills` 46、`vfxcommon` 29、`vfxinpack` 11。

### 2.6 相机与后处理

`DynamicPerspectiveCamera.cs`（动态透视）、`CameraMayaZoom.cs`（Maya 式缩放）、`CameraUtils.cs`、
`MapCameraMoveOffset.cs`、`MainCityCameraDepthMode.cs`；后处理 `ScreenBlurEffect.cs`、
`PirateGame/Graphics/Postprocessing/`。

### 2.7 资产规模（未解包）

`model` 70 个 bundle、`uimodelrender` 5、`map` 116、`effects` 6、`material` 6、`scene` 1、
`commontexture` 41、`timeline` 3、hero spine 36。

---

## 3. 需求分解

> 每条给出**必须**（M）与**可延后**（D）。验收方式统一见 §7。

### R0 平台目标（SD10 首发消费方）

- **M** 首发目标平台 = **微信小游戏 / WebGL1**（docs/3d.md SD10，2026-09-19 拍板 lvr 为首发消费方）：lvr 3D 内容以框架画质 **low 档**为必达档（docs/3D-ASSETS.md §11：只 base 层、无实时阴影、特效并发与同屏单位按 low 行上限，数字 SC0-B4 后冻结）；medium / high 是增益，⛔ 任何 M 需求不得只在 WebGL2 下成立。
- **M** 每阶段证据：A1–A5 除 Creator 预览证据外，各附一份 Chrome `--disable-webgl2` 的 `creator-preview --perf` 报告（标注 WebGL 版本与画质档）；A3 加微信开发者工具一次人工证据（截图 + 远程 bundle 下载 / 缓存 + 体积），口径同框架 SC4-B3（门，A3 等其退出）。
- **M** 体积：3D 资产全部走远程 bundle（SD12：`bundles/kit-lvr[-<map>]/`），首屏必需集合单独一个小 bundle；主包 / 分包硬上限按 docs/3D-ASSETS.md §15 冻结值。
- 边界：渠道账号 / 登录 / 支付 / 广告 / 分享 SDK、渠道打包 / 审核 / 灰度仍按 lvr.md §9.3 ⛔ 不做；本条只要求「小游戏构建可跑、WebGL1 下 low 档达标」的技术证据。小游戏构建平台配置（构建面板 / 引擎模块 / 压缩预设）归框架 settings（SC0-B4 回填内置管线在小游戏构建的可用性与体积），lvr 提需求走 docs/3d.md。

### R1 场景与相机

- **M** 一个 3D 场景根：页面 `onOpen` 里 `ports.stage3d.acquire(...)` 取框架 Stage3D 租约（透视相机 + 方向光 + 内容根由框架给，docs/3d.md §3），海面 / 天空内容挂租约 `root` 下；⛔ 不自建相机、⛔ 不改场景全局（用 `lease.setGlobals`）。
- **M** HUD 输入：主城 / 世界的 FGUI HUD 声明 `inputMode:"overlay"` 走框架接缝（3d.md §3.3，SC1-B9；lvr 世界页是 ViewMgr `kind:"cocos"` 页载体），⛔ 自建输入仲裁；SC1-B9 前只能把 HUD 画在世界页内（slg 形态）。
- **M** 相机控制：消费框架 `logic/scene3d/cameraRig.ts`（pan / pinch 锚点保持 / 惯性 / 钳制，SC2）；lvr 只带手感常量（`apps/shared/src/kits/lvr/api/…` 单源）与俯视角 / 倾角策略（kit `logic/`，吃纯度门），⛔ 不写第二套相机数学。
- **M** 缩放分档 → LOD 档事件：消费 `apps/shared/src/logic/lodBands.ts`（滞回带，SC2）；阈值表 lvr 单源。
- **D** 倾角可调 / 旋转（原作 `DynamicPerspectiveCamera` 有，但首版可固定俯视角）。

### R2 模型与动画

- **M** 静态模型渲染：建筑、地标、装饰。glTF/FBX → Cocos mesh + material。
- **M** 大批量单位动画：消费框架 `SkinnedUnits`（引擎预烘焙 `useBakedAnimation` + instancing，SC4；docs/3d.md SD3）。Cyberpunk 校正：官方演示的角色走 Marionette 动画图 + 实时蒙皮，但同屏只有 ≤ 4 个敌人；lvr 世界地图同屏几十~上百行军单位必须走预烘焙 + instancing，近景英雄（数量少、需混合）走 Marionette 动画图（docs/3D-ASSETS.md §8）。远档退化为离线简模 `lod_1` 或公告板。**需求仍只规定「同屏 100 单位 60fps」**（WebGL2 / medium 档；low 档按 docs/3D-ASSETS.md §11 的同屏单位上限并走退化路径，R0），达不到时由框架立项自写采样 shader，⛔ 不在 kit 内自写。
- **M** 2D 骨骼：英雄立绘与战斗表演。工程级 Spine 运行时选 **4.2**（docs/3d.md SD5；Cyberpunk 同样在工程里选定单一版本），原作 3.8 导出需重导出。
- **D** Timeline 式演出编排（首版用 Cocos `tween` + 动画图事件替代；Cyberpunk 用 Marionette 动画图承担状态机与事件）。

### R3 LOD 与剔除

- **M** 两级实体 LOD（对齐原作 `Lod0`/`Lod1`）：近档主文件 + 动画 + 特效，远档**离线简模** `lod_1.glb`（`tools/art3d` 生成，Cyberpunk 的 `lod_{0,1,2}.gltf` 同法）或公告板；运行时只按档**选择**资产（框架 `EntityPool`），⛔ 逐物体 `LODGroup`（Cyberpunk 1,374 个模型 0 处使用），⛔ 运行时合并网格。
- **M** 视口剔除 + 分块流式加载：消费框架 `logic/scene3d/chunkStreamer.ts`（自 slg `mapStreamer.ts` 泛化，SC2）+ `assetPlan.ts`（进档加载 / 出档延迟释放，SC3）。
- **M** 逐层 LOD 显隐开关表（每层声明 `hideAtLod`，框架 `EntityPool` 执行，lvr 只给表）；**细节层按画质档门控**（Cyberpunk `mesh-details` 做法）：装饰 / 小件 / 氛围灯归 details，low 档不加载（`data/detail-layers.json`）。
- **D** 遮挡剔除（原作 `WorldObscaleManager`；Cyberpunk 用离线烘焙的静态遮挡块 + render-id 层，属高级项）。

### R4 材质与 shader

- **M** 海面：可见的流动/波纹 + 按相机高度的多贴图混合（原作 `BigWorldSeaMultiTexCameraHeightBlend` 的等价物）。
- **M** 阴影：⚠ **不要照抄原作的三套阴影方案**。缺省**运行时阴影关**、静态光烘焙进 lightmap（Cyberpunk 全城 3,593 个 MeshRenderer 运行时不投影，靠 LightFX 烘焙 + 静态光）；只给主角 / 少量动态单位开平面阴影或 ShadowMap（`lease.light.setShadows`，按画质档），SC0 实测后定（docs/3D-ASSETS.md §6）。
- **M** 材质：PBR 标准贴图集（`_BC / _N / _ORM / _E`，docs/3D-ASSETS.md §4）；静态世界材质开 `USE_INSTANCING`；自写 EffectAsset 用 surface shader 形态落 `bundles/kit-lvr/3d/effects/lvr-*.effect`（SD12）。
- **M** 领地着色：地块归属色块叠加在地表上（`slg` 的 ownership 层已有 2D 版可参考）。
- **D** 云层、轮廓描边、地形体积装饰。

### R5 特效（VFX）

- **M** 特效播放：消费框架 `Vfx` 池（池化、按 LOD 档禁用、延迟销毁、跟随目标，SC4；对齐原作 `EffectManager` + `DelayDestoryTrigger`），lvr 只给特效目录与池容量表 `data/pool.json`。
- **M** 建筑特效挂点（原作 `BuildingEffect` + `BuildingEffectMgr`）。
- ⚠ **资产转换是本条的主成本**：Unity ParticleSystem ⛔ 不能直接转 Cocos，
  需逐个重建或用序列帧/Spine 替代。**首版建议只做 20–30 个高频特效，其余走占位。**
  重建形态照 Cyberpunk：**每个特效一个目录**（`vfx/FX_<name>/`：prefab + 自有 mtl + png），池容量走数据表（Cyberpunk `data-pool.json` 同法）。

### R6 后处理

- **D** 全部可延后。唯一可能必须的是**弹窗背景模糊**（原作 `ScreenBlurEffect`），
  但本仓 `PopupBlurMgr` 的等价需求可用截图 + 模糊贴图的 2D 做法绕过。

### R7 资产管线（本文档的第二大块）

消费框架 `tools/art3d/`（骨架 + 通用步骤，SC5；docs/3d.md §4），lvr 只带 `apps/kits/lvr/art/3d/art3d.config.json`、材质映射表与策展（⛔ 不再建 `tools/lvr-art3d/`）；步骤对照：

| 步骤 | 输入 | 输出 |
| --- | --- | --- |
| 解包 | `assets/AssetBundles/*.ab`（2,587 个） | UnityPy 抽出 Mesh / Texture2D / Material / AnimationClip / Shader |
| 网格转换 | Unity Mesh | glTF 2.0 `.glb`（Creator 作者态导入，⛔ 无运行时 loader）+ 离线 `lod_1 / lod_2.glb` |
| 贴图转换 | Texture2D（含 ASTC/ETC 压缩） | png（POT、命名 `T_<Asset>_BC/_N/_ORM/_E`），平台压缩交 Creator 预设 `3d-default`（astc_8x8 + png 回落，docs/3D-ASSETS.md §5） |
| 动画转换 | AnimationClip / GPUSkinning 烘焙贴图 | Cocos 动画或自定义采样贴图 |
| 材质映射 | Unity Material + shader 参数 | 手工映射表：缺省 `builtin-standard` PBR 贴图集，特殊（海面 / 领地 / 描边）映射到自写 surface shader（⛔ shader 不能自动转） |
| 图集与去重 | 上述全部 | 按场景打包，产出引用表 JSON |
| 往返自检 | 转换前后 | 照 `tools/slg-maps/verify-redraw.py` 做逐像素/逐顶点比对 |

**落点必须在 kit 所有权推导集内**：`apps/kits/lvr/art/3d/`（源：glb / png / `art3d.config.json` / `LICENSES.md` 授权台账）与运行时 `apps/Cocos/assets/bundles/kit-lvr/3d/{models,textures,materials,effects,vfx,anims,spine}/`（每包一个 bundle，可按地图细分 `bundles/kit-lvr-<map>/`，docs/3d.md SD12）+ 小数据表 `apps/Cocos/assets/resources/kits/lvr/3d/data/`（运行时目录含 Creator 导入产物与 `.meta`，⛔ 不是源的逐字节镜像）。

### R8 资源生命周期与内存

- **M** 资源持有：消费框架 `AssetLease`（一路一租约、失败 / 超时 / 取消整包释放、迟到完成仍 decRef，SC3）；⛔ 不照抄 `SlgArtResources`——slg 自己也在 SC3 改为消费。
- **M** 按 LOD 档与视口的资源装卸：消费 `assetPlan.ts`；预加载清单走数据表 `data/preload.json`（Cyberpunk `data-res-cache.json` 同法），⛔ 不像 Cyberpunk 那样全量预载后永不释放——lvr 资产体量大，必须随页面租约释放。
- ⚠ 与 lvr.md §9.2 的「FGUI 只有加载没有卸载路径」是同一类问题，3D 资产体量更大，**必须在第一版就有释放路径**。

---

## 4. 与 gono 框架的接口约束（不可协商）

| 约束 | 出处 |
| --- | --- |
| 首发平台 = 微信小游戏 / WebGL1，画质 low 档必达、每阶段附 WebGL1 证据（R0） | docs/3d.md §9.1 SD10（2026-09-19 拍板 lvr 为首发消费方） |
| lvr 自有代码落在 `apps/client/src/kits/lvr/**`；3D 重资产落在 `apps/Cocos/assets/bundles/kit-lvr[-<map>]/3d/**`、小数据表 `resources/kits/lvr/3d/data/`（SD12）；舞台 / 租约 / 纯数学 / 机械件 / 画质分档**消费框架**（docs/3d.md §2），⛔ 不自建 | 所有权推导集（`apps/server/tools/plugin/ownership.ts`）+ docs/3d.md §2 划线 |
| `logic/` ⛔ 不 import `cc` / `fairygui-cc`，依赖注入、Node 无头可测 | 铁律 9 + `apps/client/test/logic-purity.test.ts` |
| `view/` 只做绑定与渲染，⛔ 不做业务判断 | `docs/CLIENT.md` §3 |
| 页面经 `<Name>View.view.json` sidecar + `kit.json` 登记 + `codegen:plugins`，⛔ 不手改 `views.generated.ts` | 铁律 2 |
| 实心矩形用 `view/uiPlate.ts` 的 `createSolidPlate()`，⛔ 不要一矩形一 `Graphics`（实测 112.6MB → 0.1MB） | `docs/CLIENT.md` §3 |
| ⛔ 不加 npm 依赖；glTF / FBX 由 Creator 作者态导入，**运行时不需要任何 loader**（docs/3d.md SD4），第三方库不再是前置 | `docs/KIT.md` §2；docs/3d.md SD4 |
| ⛔ 不改 `apps/Cocos/settings/**`（引擎模块 / 层位 / 物理分组 / 纹理压缩预设归框架，提需求走 docs/3d.md） | docs/3d.md §2 |
| `.meta` 随 `apps/Cocos/assets/` 提交，uuid 全树唯一；多人并行铸 meta 会撞 | `scripts/sync-client.mjs` 的 `checkMetaContents` |
| 相对导入 ⛔ 不带扩展名 | 铁律 3 |

---

## 5. 分期建议

| 阶段 | 内容 | 判据 |
| --- | --- | --- |
| **A0 可行性 spike**（并入框架 SC0） | 用 UnityPy 从原作 bundle 取 **1 个建筑模型 + 1 套单位动画 + 1 张海面贴图**，在框架 SC0 的 CDP 探针里作第二份证据渲出来 | ⚠ **这是门**：Unity 材质/shader 不能自动转，若此步走不通需重估整条管线；框架接缝五项判据归 SC0 |
| **A1 场景骨架**（← SC1–SC3） | 取 Stage3D 租约 + 海面 EffectAsset + 静态地表 + `cameraRig` / `lodBands` 常量 | 能在 `kind:"cocos"` 页里平移缩放，60fps（`creator-preview --perf`）；WebGL1 证据一份（R0） |
| **A2 实体层**（← SC3） | `EntityPool` 两级档 + `chunkStreamer` + `assetPlan` + 19 种实体预制 / 离线 `lod_1` | 同屏 100 实体 60fps，进出视口引用归零；WebGL1 low 档按 3D-ASSETS §11 上限达标（R0） |
| **A3 单位动画**（← SC4） | `SkinnedUnits`（预烘焙 + instancing）+ 行军线简模 | 同屏 100 个动画单位 60fps；WebGL1 退化路径（预烘焙不可用 → 实时蒙皮上限 + 公告板远档）+ 微信开发者工具证据（R0；等 SC4-B3 门） |
| **A4 主城**（← SC3、SC4） | 三档细节状态机（kit `logic/`）+ 建筑四态 + 建筑特效挂点表 + 细节层按画质档 | 主城三档切换无卡顿；low 档 details 层不加载（R3）且 WebGL1 证据一份（R0） |
| **A5 特效与表演**（← SC4） | `Vfx` 池 + 20–30 个高频特效（每特效一目录）+ Spine 4.2 立绘 | 战斗表演可看；low 档特效并发上限内（R0） |

---

## 6. 风险与开放项

| 风险 | 说明 |
| --- | --- |
| **shader ⛔ 不能自动转** | Unity shader → Cocos EffectAsset 全部要手工重写。海面、GPU skinning 采样、阴影三处是硬骨头。A0 spike 必须覆盖至少一个 |
| **Unity ParticleSystem ⛔ 不能转** | 265 个 vfxbaseres bundle 的特效要逐个重建或替代。这可能是整条管线最大的隐藏工作量 |
| **压缩贴图格式** | 原作 bundle 里可能是 ASTC/ETC2，解出后要重新按 Cocos 的平台策略压 |
| **Spine 版本** | 工程级选 4.2（docs/3d.md SD5）；原作 3.8 导出需重导出 |
| **~~第三方库 = 框架 PR~~** | 已消解：作者态导入，运行时无 loader（docs/3d.md SD4） |
| **烘焙工作流** | 静态光 / 反射探针在 Creator 内人工烘焙（Cyberpunk LightFX 做法），产物体积进预算；谁烘、烘完怎么 apply 回预制并入库，在 A1 前定（docs/3D-ASSETS.md §6） |
| **仓内零 3D 先例** | 框架 SC1 的 `stage3dFixture` 与 `stage3d-dev.scene` 是先例；做法对照 Cocos Cyberpunk（docs/3D-ASSETS.md §1） |
| **WebGL1 首发（SD10）** | 预烘焙蒙皮 / instancing / ASTC 在 WebGL1 不保证可用（docs/3d.md §8）；框架 SC4-B3 是门，A3 等其退出；若 low 档退化后同屏单位达不到 3D-ASSETS §11 上限，重估 R2 数字或改公告板远档，⛔ 不为 lvr 单独放宽档位 |
| **素材授权** | 与 lvr.md §6.2 同一口径：走复用，但需在 `apps/kits/lvr/README.md` 建与 snake 同规格的素材授权台账 |

---

## 7. 验收

每阶段与 lvr.md §10 同一动线，另加 3D 特有项：

- `npm run typecheck` / `test:client`（logic 层无头测试必须覆盖相机数学、LOD 分档、流式器差分）
- `npm run verify:all` exit 0
- **Creator 真引擎预览证据**：截图 + `report.json` 落 `docs/evidence/creator-<date>/lvr-3d/`，console 为空
- **性能实证**：同屏实体数 × 帧率，用 `node tools/creator-preview/run.mjs <lvr 剧本> --perf`（帧时 / draw call / 三角数 / GFX 内存，标注画质档与设备；⛔ `perf:client` 是 Node 无头探针，不测 GPU）
- **资源泄漏实证**：反复进出视口/切换场景 N 次后显存回到基线
- **WebGL1 证据**（R0，SD10 首发消费方）：每阶段一份 `--disable-webgl2` 的 `--perf` 报告；A3 加微信开发者工具人工证据

---

## 8. 实施状态回写

> 未立项。每阶段完成在此登记一行（阶段 / 日期 / commit / 实际交付与性能数据 / 偏差）。
> ⛔ 不向 plan-v5 回写。

- 暂无完成记录。
