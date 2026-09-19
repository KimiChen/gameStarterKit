# `lvr` kit 的 3D 场景管线 —— 需求文档

> - 日期：2026-09-18。状态：**需求 v1，未开工**；⛔ 未实施任何 3D 能力。
> - 归属：本文是 [lvr.md](lvr.md) §9.1 拍板「走 B：自建 3D 管线，用 Cocos 的 3D 能力」之后拆出的独立需求，
>   **由单独的人/单独的排期实现**，⛔ 不占 lvr.md §7 的 100–200 人月核心工程估算。
> - 逆向源：`../sourceVersion/lvr-1.0.0/`（仓外，只读）。本文引用的类名与目录均为实测。
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

### R1 场景与相机

- **M** 一个 3D 场景根：透视相机 + 方向光 + 天空/海面背景，挂在 `kind:"cocos"` View 给的全屏 root Node 下。
- **M** 相机控制：平移（拖拽 + 惯性）、缩放（滚轮 / 双指 pinch，锚点保持）、边界钳制。
  纯数学部分放 `apps/client/src/kits/lvr/logic/`（吃纯度门，Node 无头可测），⛔ 不 import `cc`。
- **M** 缩放分档 → LOD 档事件（带滞回带，避免档位抖动）。参考 `slg` 的 `mapCamera.ts` + 四档 LOD + ±8% 滞回。
- **D** 倾角可调 / 旋转（原作 `DynamicPerspectiveCamera` 有，但首版可固定俯视角）。

### R2 模型与动画

- **M** 静态模型渲染：建筑、地标、装饰。glTF/FBX → Cocos mesh + material。
- **M** 大批量单位动画：**GPU skinning 或等价方案**。原作在世界地图上同屏几十~上百个行军单位，
  ⛔ 逐个 `SkeletalAnimation` 组件不可行。可选方案：
  (a) 复刻烘骨骼到贴图 + 自写 EffectAsset 采样（与原作同构）；
  (b) 顶点动画烘到 mesh（morph）；
  (c) 远档退化为公告板 Sprite（原作 Lod1 实际就接近这个）。
  **需求只规定「同屏 100 单位 60fps」，方案由实现方选。**
- **M** 2D 骨骼：英雄立绘与战斗表演。Cocos 原生支持 Spine，但**需确认 Spine 版本与导出格式**（见 §6 风险）。
- **D** Timeline 式演出编排（首版用代码 + DOTween 等价物替代）。

### R3 LOD 与剔除

- **M** 两级实体 LOD（对齐原作 `Lod0`/`Lod1`）：近档真模型 + 动画 + 特效，远档简化/公告板/合批。
- **M** 视口剔除 + 分块流式加载（照 `slg` 的 `mapStreamer.ts`：可见矩形 → 外扩 margin → 滞回带 → 环形扩张 → chunk 集 added/removed 差分）。
- **M** 逐层 LOD 显隐开关表（每层声明 `hideAtLod`，LOD 事件驱动）。
- **D** 遮挡剔除（原作 `WorldObscaleManager`）。

### R4 材质与 shader

- **M** 海面：可见的流动/波纹 + 按相机高度的多贴图混合（原作 `BigWorldSeaMultiTexCameraHeightBlend` 的等价物）。
- **M** 阴影：⚠ **不要照抄原作的三套阴影方案**。先用 Cocos 内置阴影或平面投影阴影（`PlanarShadow` 等价物）评估性能，够用即止。
- **M** 领地着色：地块归属色块叠加在地表上（`slg` 的 ownership 层已有 2D 版可参考）。
- **D** 云层、轮廓描边、地形体积装饰。

### R5 特效（VFX）

- **M** 一个特效管理器：池化、按 LOD 档禁用、延迟销毁、跟随目标。对齐原作 `EffectManager` + `DelayDestoryTrigger`。
- **M** 建筑特效挂点（原作 `BuildingEffect` + `BuildingEffectMgr`）。
- ⚠ **资产转换是本条的主成本**：Unity ParticleSystem ⛔ 不能直接转 Cocos，
  需逐个重建或用序列帧/Spine 替代。**首版建议只做 20–30 个高频特效，其余走占位。**

### R6 后处理

- **D** 全部可延后。唯一可能必须的是**弹窗背景模糊**（原作 `ScreenBlurEffect`），
  但本仓 `PopupBlurMgr` 的等价需求可用截图 + 模糊贴图的 2D 做法绕过。

### R7 资产管线（本文档的第二大块）

新建 `tools/lvr-art3d/`，形态照 `tools/slg-maps/`（venv + `*.config.json` + 分步脚本 + 往返自检）：

| 步骤 | 输入 | 输出 |
| --- | --- | --- |
| 解包 | `assets/AssetBundles/*.ab`（2,587 个） | UnityPy 抽出 Mesh / Texture2D / Material / AnimationClip / Shader |
| 网格转换 | Unity Mesh | glTF 或 Cocos mesh asset |
| 贴图转换 | Texture2D（含 ASTC/ETC 压缩） | png，按平台再压 |
| 动画转换 | AnimationClip / GPUSkinning 烘焙贴图 | Cocos 动画或自定义采样贴图 |
| 材质映射 | Unity Material + shader 参数 | 手工映射到自写 EffectAsset（⛔ shader 不能自动转） |
| 图集与去重 | 上述全部 | 按场景打包，产出引用表 JSON |
| 往返自检 | 转换前后 | 照 `tools/slg-maps/verify-redraw.py` 做逐像素/逐顶点比对 |

**落点必须在 kit 所有权推导集内**：`apps/kits/lvr/art/`（源）与
`apps/Cocos/assets/resources/kits/lvr/`（运行时，逐字节镜像）。

### R8 资源生命周期与内存

- **M** 引用计数 + fail-closed 形状闸 + 失败整包 release，**照抄 `apps/client/src/kits/lvr/...` 的模板来源
  `apps/client/src/kits/slg/view/SlgArtResources.ts`**（addRef/decRef、批量加载、失败回滚）。
- **M** 按 LOD 档与视口的资源装卸策略（进档加载、出档延迟释放）。
- ⚠ 与 lvr.md §9.2 的「FGUI 只有加载没有卸载路径」是同一类问题，3D 资产体量更大，**必须在第一版就有释放路径**。

---

## 4. 与 gono 框架的接口约束（不可协商）

| 约束 | 出处 |
| --- | --- |
| 全部代码落在 `apps/client/src/kits/lvr/**` 与 `apps/Cocos/assets/resources/kits/lvr/**` | 所有权推导集（`apps/server/tools/plugin/ownership.ts`） |
| `logic/` ⛔ 不 import `cc` / `fairygui-cc`，依赖注入、Node 无头可测 | 铁律 9 + `apps/client/test/logic-purity.test.ts` |
| `view/` 只做绑定与渲染，⛔ 不做业务判断 | `docs/CLIENT.md` §3 |
| 页面经 `<Name>View.view.json` sidecar + `kit.json` 登记 + `codegen:plugins`，⛔ 不手改 `views.generated.ts` | 铁律 2 |
| 实心矩形用 `view/uiPlate.ts` 的 `createSolidPlate()`，⛔ 不要一矩形一 `Graphics`（实测 112.6MB → 0.1MB） | `docs/CLIENT.md` §3 |
| ⛔ 不加 npm 依赖（需框架 PR）——**若 3D 管线需要第三方库（如 glTF loader），这是一条必须提前提出的框架 PR** | `docs/KIT.md` §2 |
| `.meta` 随 `apps/Cocos/assets/` 提交，uuid 全树唯一；多人并行铸 meta 会撞 | `scripts/sync-client.mjs` 的 `checkMetaContents` |
| 相对导入 ⛔ 不带扩展名 | 铁律 3 |

---

## 5. 分期建议

| 阶段 | 内容 | 判据 |
| --- | --- | --- |
| **A0 可行性 spike** | 用 UnityPy 从原作 bundle 取 **1 个建筑模型 + 1 套单位动画 + 1 张海面贴图**，在 Cocos 里渲出来 | ⚠ **这是门**：Unity 材质/shader 不能自动转，若此步走不通需重估整条管线 |
| **A1 场景骨架** | 3D 相机 + 海面 + 静态地表 + 相机控制与 LOD 分档 | 能在 `kind:"cocos"` View 里平移缩放，60fps |
| **A2 实体层** | 两级 LOD 实体渲染 + 分块流式加载 + 资源生命周期 | 同屏 100 实体 60fps，进出视口不泄漏 |
| **A3 单位动画** | GPU skinning 或等价方案 + 行军线 | 同屏 100 个动画单位 60fps |
| **A4 主城** | 三档细节状态机 + 建筑四态 + 建筑特效挂点 | 主城三档切换无卡顿 |
| **A5 特效与表演** | 特效管理器 + 20–30 个高频特效 + Spine 立绘 | 战斗表演可看 |

---

## 6. 风险与开放项

| 风险 | 说明 |
| --- | --- |
| **shader ⛔ 不能自动转** | Unity shader → Cocos EffectAsset 全部要手工重写。海面、GPU skinning 采样、阴影三处是硬骨头。A0 spike 必须覆盖至少一个 |
| **Unity ParticleSystem ⛔ 不能转** | 265 个 vfxbaseres bundle 的特效要逐个重建或替代。这可能是整条管线最大的隐藏工作量 |
| **压缩贴图格式** | 原作 bundle 里可能是 ASTC/ETC2，解出后要重新按 Cocos 的平台策略压 |
| **Spine 版本** | 需确认原作 Spine 运行时版本与 Cocos 内置版本是否兼容，不兼容则要重导出 |
| **第三方库 = 框架 PR** | 任何新 npm 依赖都需框架 PR，⛔ kit 加不了。A0 就要确定是否需要 |
| **仓内零 3D 先例** | `.meta`、资源目录、构建配置、Creator 场景序列化都没有 3D 的踩坑记录，预留调试余量 |
| **素材授权** | 与 lvr.md §6.2 同一口径：走复用，但需在 `apps/kits/lvr/README.md` 建与 snake 同规格的素材授权台账 |

---

## 7. 验收

每阶段与 lvr.md §10 同一动线，另加 3D 特有项：

- `npm run typecheck` / `test:client`（logic 层无头测试必须覆盖相机数学、LOD 分档、流式器差分）
- `npm run verify:all` exit 0
- **Creator 真引擎预览证据**：截图 + `report.json` 落 `docs/evidence/creator-<date>/lvr-3d/`，console 为空
- **性能实证**：同屏实体数 × 帧率，用 `npm run perf:client` 或自建基准；DrawCall 与显存要记录
- **资源泄漏实证**：反复进出视口/切换场景 N 次后显存回到基线

---

## 8. 实施状态回写

> 未立项。每阶段完成在此登记一行（阶段 / 日期 / commit / 实际交付与性能数据 / 偏差）。
> ⛔ 不向 plan-v5 回写。

- 暂无完成记录。
