# 3D 实施施工单：SC0–SC5 逐批次 + 消费方接入（lvr / mmo / slg）

> - 日期：2026-09-19。依据 [3d.md](3d.md) **v1**（2026-09-19）与 [lvr-3d.md](../lvr-3d.md)（需求 v1，已降为 lvr 消费方需求）。基线 `f6fad19f`（MF9-B1 已合入；⚠ 工作树里 MF9-B2 施工中：`tools/plugin/**`、`plugin-codegen/**`、`scripts/protected-paths.json` 有未提交改动，本文的 protected-paths 批次排在其之后）。
> - 定位：**施工单 + 本轮审阅记录**——§1 是对 3d.md / lvr-3d.md 的第二轮审阅（3D-13–3D-22、L01–L09），§3–§4 把 3d.md §6 的每个阶段拆成可独立提交、可独立验收的批次（`SCx-Bn`），写清文件落点、机检退出条件与命令。⛔ 本文不是设计真源：与 3d.md 冲突处以 3d.md 为准；本文发现的设计缺口只登记在 §6「施工细化」并回写 3d.md，⛔ 不在本文另立口径。
> - 状态回写：阶段级完成只回写 3d.md §10；**批次级勾选只在本文 §8**；lvr 接入回写 lvr-3d.md §8。⛔ 不进 plan-v5。
> - 形态与纪律照 [MMO-PLAN.md](MMO-PLAN.md)：一批一提交、变异验证进提交信息、夹具只用灰盒、阶段退出打轻量 tag。

## 0. 总览：波次与并行

```text
波 0   SC0 可行性 spike（门）：引擎面清单 ‖ 灰盒 glb 生成器 ‖ CDP 探针实测（WebGL2 + WebGL1）→ 冻结数字与回填（SD9–SD12 已于 2026-09-19 拍板）
波 1   SC1 Stage3D + 类型桩 + AppPorts.stage3d + 夹具页 + verify:assets3d（← SC0；protected-paths 批 ← MF9-B2 合入）
波 2   SC2 纯数学（lodBands → shared/logic；cameraRig / chunkStreamer / pickMath → client logic/scene3d；slg 改消费）  ‖  SC3 AssetLease + assetPlan + EntityPool + 全局设置租约 + creator-preview --perf（slg 改消费）
波 3   SC4 SkinnedUnits + Vfx + WebGL1 退化实证（← SC2 + SC3）
波 4   SC5 tools/art3d 骨架 + 文档回写 + 冻结 tag stage3d-v1-frozen（← SC1–SC4）
消费方 lvr A1 ← SC1–SC3；lvr A3 ← SC4；lvr A0 并入 SC0（用 lvr 样本资产做第二份证据）
       mmo：SD9 = C（已拍板）：首版 2D 公告板 + 接口 3D-ready，MK0-B4 不等本轨道；MK1 前按 SC3 / SC4 数字（含 WebGL1）决定是否切 3D
       slg 2b：SC2 退出即可消费 lodBands / cameraRig / chunkStreamer；SC3 退出迁 AssetLease + 全局设置租约
```

| 波 | 阶段 | 批次数 | 首个外部受益方 |
| --- | --- | --- | --- |
| 0 | SC0 | 4 | 3d.md §9.2 冻结表；SD9（mmo 世界视图形态） |
| 1 | SC1 | 6 | 框架有 3D 夹具页与类型桩；kit 可写 3D View 不再撞桩 |
| 2 | SC2、SC3 | 5 + 6 | slg 2b（纯数学）；slg 现网两处场景全局直改归位 |
| 3 | SC4 | 4 | lvr A3、mmo MK1（若 SD9 = 3D） |
| 4 | SC5 | 2 | lvr `art3d.config.json` 可跑；`stage3d-v1-frozen` |

## 1. 本轮审阅记录

### 1.1 docs/3d.md（v1，2026-09-19）——3D-13–3D-22

严重度：High = 按原文实施会撞仓内闸或做不出来；Medium = 需改设计才能作为验收依据；Low = 措辞 / 归属。3D-01–3D-12 是 3d.md §1 对 lvr-3d.md 的发现，本节编号接续。

| 编号 | 严重度 | 3d.md 章节 | 问题 | 证据 | 处置（本文落点 → 回写 3d.md） |
| --- | --- | --- | --- | --- | --- |
| 3D-13 | Medium | §3.3 | 「`Stage3DPort` 经与 `gameplay/services.ts` 同形的端口注入」指错了接缝：kit / 插件页面拿端口的唯一入口是 `PluginInstallContext.ports: AppPorts`（slg 就用 `context.ports.session / lobbyRpc / clock / ticker / navigation`），`gameplay/services.ts` 是给 `GameplayModule` 的服务面 | `apps/client/src/app/PluginHost.ts:35-40`；`apps/client/src/app/ports.ts:108-117` `AppPorts`；`apps/client/src/kits/slg/index.ts:5-13` | `AppPorts` 加 `stage3d: Stage3DPort`（`app/ports.ts`，已在保护面 `app/**`，天然是框架 PR）；SC1-B3；回写 3d.md §3.3 |
| 3D-14 | Medium | §4 | `Stage3D.ts` / `stage3dLayers.ts` 登进 protected-paths gameplayFlow 需 `protected-paths-lock.mjs --write`，而 `scripts/protected-paths.json` 正被 MF9-B2 改（未提交）；两个轨道同改一把锁会互相打红 | `git diff --stat`（`scripts/protected-paths.json` 5 行）；MMO-PLAN §1 第 2 条 | SC1-B3 的 protected-paths 子步排在 MF9-B2 合入之后；§6 P1 |
| 3D-15 | Medium | §5.2 / §4 | 「`verify:assets3d` 进 `verify:all`」漏了仓内三道配套闸：新根命令必须登记进 CLAUDE.md 常用命令表（`checkRootCommandTable`，先例 d4794205 基线红）；AGENTS.md 必须与 CLAUDE.md 除空白外逐字一致（`verify-inventory.mjs:700`）；挂点是 `package.json` 的 `verify:core` 链 | `scripts/verify-inventory.mjs:696-708`；`package.json:73` | SC1-B5 同批改四处（脚本 / package.json / CLAUDE.md / AGENTS.md）+ inventory 能力条目；§6 P2 |
| 3D-16 | Medium | §4 / §6.2 SC2 | 「`slgLodForScaleStable` 泛化为 `logic/scene3d/lodBands.ts`（客户端）」放错层：它今天在 slg 的 **shared** api 面（`worldmap` v1），shared ⛔ 不能 import 客户端；且 slg.md §8 #1「LOD 档 → 下发字段集」要服务端也用同一滞回 | `apps/shared/src/kits/slg/api/worldmap/index.ts:12-14,139-145`；铁律 4 / 6 | `lodBands` 落 `apps/shared/src/logic/lodBands.ts`（shared 零依赖，公式归 shared/logic），slg 的函数改为薄包装保持签名；`cameraRig` / `chunkStreamer` / `pickMath` 仍在客户端 `logic/scene3d/`；SC2-B1；回写 3d.md §4 |
| 3D-17 | Medium | §3.2 / §0.1 判据 1 | 全局设置只能随**整座舞台**的租约设置，但 slg 是 2D 页、不持 3D 舞台，却确实要改 `postSettings.toneMappingType`（今天直改）；按 3d.md 原文 slg 无路可走 | `SlgChunkRenderer.ts:29-31,63`、`SlgTilemapRenderer.ts:58-60,144` | `Stage3DPort` 增 `acquireGlobals(patch) → lease`（栈式，release 恢复上一层；与舞台租约独立、可并存）；SC3-B4 slg 迁移；回写 3d.md §3.2 |
| 3D-18 | Medium | §7 / §4 | 性能证据只写「帧时 / draw call / 三角数 / GFX 内存」，没钉到引擎 API，探针写不出来 | `cc.d.ts:8243-8263,9656-9703` `gfx.Device.numDrawCalls / numTris / numInstances / memoryStatus`；`:7906-7911` `director.root.frameTime / frameCount`；`tools/creator-preview/probe-model.mjs` 已有 `_collectModels` 读法 | SC3-B5 `--perf` 用这五个计数器，采样窗 240 帧 + 60 帧 warmup（同 `perf:client`）；回写 3d.md §7 |
| 3D-19 | Medium | §6.2 SC0 | SC0 要「一个灰盒 `.glb` + 一个蒙皮单位」但仓内零 3D 资产，也没说资产从哪来；用 lvr 原作资产做框架 spike 会把授权与 Unity 抽取的不确定性混进「门」 | `find apps/Cocos/assets -name '*.glb'` 为空；lvr-3d §6 素材授权行 | SC0-B2 `tools/art3d/greybox.py`（pygltflib 纯合成：立方体、地面、两骨 biped + 一段动画），零授权问题；lvr 样本资产只做 A0 的第二份证据；回写 3d.md §6.2 |
| 3D-20 | Low | §5.1 | Spine 4.2 是**工程级单选**（`spine-3.8` / `spine-4.2` 特性互斥），文中未说明切换影响面 | `engine/cc.config.json` features；仓内无 `sp.Skeleton` 用法 | 今天零 Spine 用法 ⇒ 切 4.2 无影响；SC0-B1 勾选并写进 `apps/Cocos/README.md`；回写 3d.md §5.1 一句 |
| 3D-21 | Low | §6.3 | 「mmo MK0 客户端世界引擎 ← SC3」把 mmo 世界视图默认成 3D；MMO.md §7.6 / MMO-PLAN MK0-B4 只写「bitECS 实体池 + 插值 + 相机 + 最小 HUD」，未拍板 2D 还是 3D | `docs/MMO.md:755`；`docs/MMO-PLAN.md:232` | 立 **SD9**：mmo 世界视图形态（2D `UIMeshRenderer` 公告板 vs 3D Stage3D），SC0-B4 与 MK0-B4 之前拍板；本文 §4 按两种结果各写接法；回写 3d.md §9。**已拍板 C（2026-09-19，3d.md §9.1）** |
| 3D-22 | Low | §4 夹具行 | 夹具页资产落点未定：`resources/kits/<id>/` 与 `resources/plugins/<id>/` 都是包所有权目录，框架夹具放哪都越界 | `tools/plugin/ownership.ts:285-297` 运行时资源按包分命名空间；`resources/ui` 是框架 FGUI 先例 | 框架 3D 资产目录 `apps/Cocos/assets/resources/stage3d/`（与 `resources/ui` 同级、框架所有）；`verify:assets3d` 扫 `resources/stage3d/**` + `resources/{kits,plugins}/*/3d/**`；回写 3d.md §4 / §5 |

### 1.2 lvr-3d.md（需求 v1 + 2026-09-19 提升指针）——L01–L09

lvr-3d.md 抬头已指向 3d.md，但正文当时仍是「全部落在 kit」的旧口径；下面九条已于 2026-09-19 随 Cocos Cyberpunk 校正一并落实（lvr-3d.md v1.1，提交 eef7c1a2），本表保留为审阅记录：

| 编号 | 章节 | 问题 | 对齐后口径 |
| --- | --- | --- | --- |
| L01 | §4 表 | 「全部代码落在 `apps/client/src/kits/lvr/**`」「glTF loader 是必须提前提出的框架 PR」两行与 3d.md §2 / SD4 冲突 | 改为「内容 / shader / 特效 / 数值落 kit；舞台 / 租约 / 纯数学 / 机械件消费框架（3d.md §2）」；删 glTF loader 行，改「Creator 作者态导入 `.glb`」 |
| L02 | §5 分期 | A0–A5 没有映射到 SC0–SC5，A0 与 SC0 重复 | A0 并入 SC0（lvr 样本资产作第二份证据）；A1 ← SC1–SC3；A2 ← SC3；A3 ← SC4；A4 / A5 内容随 lvr 排期（本文 §4.1） |
| L03 | §7 验收 | 「`npm run perf:client` 或自建基准」——`perf:client` 不测 GPU | 改为 `tools/creator-preview --perf`（SC3-B5）+ `docs/evidence/creator-<date>/lvr-3d/` |
| L04 | §6 风险 | 「第三方库 = 框架 PR」「仓内零 3D 先例」 | 前者删（SD4）；后者改「框架 `stage3dFixture` 是先例（SC1）」 |
| L05 | R2 | 「复刻烘骨骼到贴图 + 自写 EffectAsset 采样」列为候选 (a) | 改为消费框架 `SkinnedUnits`（引擎预烘焙 + instancing，SD3）；自写采样只在 SC0 不达标时由框架立项 |
| L06 | R8 | 「照抄 `SlgArtResources`」 | 改为消费 `AssetLease` + `assetPlan`（SC3） |
| L07 | R1 | 「透视相机 + 方向光挂在 `kind:"cocos"` View 给的全屏 root Node 下」 | 改为「页面 `onOpen` 里 `ports.stage3d.acquire(...)` 取租约，内容挂租约 `root`」（3d.md §3） |
| L08 | R3 / R5 | 「照 `slg` 的 `mapStreamer.ts`」「一个特效管理器」 | 改为消费 `chunkStreamer` / `lodBands`（SC2）与 `Vfx`（SC4），kit 只带阈值表与内容 |
| L09 | 抬头 | 「由单独的人 / 单独排期实现，⛔ 不占 lvr.md §7 估算」仍对，但现在是**三份预算**：框架 SC0–SC5（本文）、lvr 3D 内容（lvr-3d.md）、lvr 核心工程（lvr.md §7） | 抬头补一句三份预算的边界 |

## 2. 施工纪律（每一批都适用）

1. **一批 = 一个提交**（提交信息以批次号开头：`SC1-B2：…`），批内 `npm run verify:all` 绿才提交；改了 `apps/client/**` 的批另跑 `npm run typecheck`（两套探针）+ `npm run test:client`；改了 `scripts/protected-paths.json` 的批 `node scripts/protected-paths-lock.mjs --write`；新增根命令的批同批登记 CLAUDE.md 常用命令表并 `cp CLAUDE.md AGENTS.md`（verify-inventory 两道闸，3D-15）。
2. **纯度门**：相机 / LOD / 流式 / 拾取 / 资产计划只在 `apps/client/src/logic/scene3d/**` 或 `apps/shared/src/logic/**`，`logic-purity.test.ts` 自动受门；`view/scene3d/**` 只做 Node / 组件绑定，依赖注入引擎适配器以便 FakeNode 无头测试（`cocosPages.test.ts` 同法）。
3. **变异验证**是退出条件的一部分：每批在测试头注释或提交信息写「改哪一行 → 哪条用例转红」，至少手工执行一次。
4. **夹具纪律**：框架段 ⛔ 不得出现 `apps/kits/lvr/`、海面 / 城建 / 英雄等内容词；只用 `stage3dFixture` 页面与 `tools/art3d/greybox.py` 合成的灰盒资产（`resources/stage3d/greybox-*.glb`）。
5. **Creator 证据 ⛔ 不是门禁**：`tools/creator-preview` 的 `stage3d` 剧本与 `--perf` 落 `docs/evidence/creator-<date>/stage3d/`（`.gitignore` 不入库），只把数字摘要写进 `docs/perf/stage3d/<date>-<scenario>.json` 与 3d.md §10。
6. **协议整数 / 生成物**：本轨道不碰 shared protocol、玩法 wire 与任何 codegen 生成物；夹具页只是 builtin 宿主插件的一条 route（`apps/plugins/builtin/plugin.json` + sidecar），走 `codegen:plugins`。
7. **上游**：Cocos 引擎 API 以本机 `cc.d.ts` 为准，提交信息写「引擎对照：cc.d.ts@3.8.8 <行号>」；⛔ 不 vendored 任何 3D 第三方库（SD4）。
8. **回写**：阶段退出 → 3d.md §10 一行（阶段 / 日期 / commit / 实测数字 / 偏差）+ 本文 §8 勾批次 + 轻量 tag（`sc1-exit` …，SC5 打 `stage3d-v1-frozen`）；SC2 / SC3 退出时通知 slg.md §10.8；SC1 / SC3 / SC4 退出时通知 lvr-3d.md §8。

## 3. 框架阶段施工单

### SC0 · 可行性 spike（门，波 0）

| 批次 | 内容 | 机检退出 / 证据 | 命令 |
| --- | --- | --- | --- |
| SC0-B0 文档对齐 ✅（eef7c1a2） | lvr-3d.md 按 §1.2 L01–L09 改为消费方需求 v1.1；3d.md 按 §1.1 3D-13–3D-22 出 v1.1，并对照 Cocos Cyberpunk 实测校正；素材规范拆到 [3D-ASSETS.md](3D-ASSETS.md) | 表格列数 / 链接机检通过 | 已提交 |
| SC0-B1 引擎面清单 | 打开 `apps/Cocos`：把 `engine.json` 改为显式模块清单（SD11：`custom-pipeline` + `custom-pipeline-builtin-scripts` + `custom-pipeline-post-process` ON、`legacy-pipeline` OFF；关 terrain / tiled-map / dragon-bones / xr / physics / particle-2d 等），确认当前管线（CDP 读 `cc.director.root.pipeline` 构造名）、`project.json` 声明两个保留层位、补 `wechatgame.json` 并做一次微信小游戏构建记录体积（SD10）、UI 相机参数（`scene.scene:172-200`）；Spine 切 4.2 并确认无既有用法；写进 `apps/Cocos/README.md` 新段「引擎模块、管线与相机」 | README 段落存在；小游戏构建产物存在且体积成文；`verify:inventory` 绿（AGENTS / CLAUDE 不变） | 人工 Creator；文档提交 |
| SC0-B2 灰盒资产生成器 | `tools/art3d/greybox.py`（pygltflib + numpy，venv 照 `tools/slg-maps/README.md`）：`greybox-cube.glb`（静态）、`greybox-plane.glb`（地面 64×64）、`greybox-biped.glb`（两骨 skin + 一段 1 s 摆动动画）；输出到 `apps/Cocos/assets/resources/stage3d/`；Creator 导入一次生成 `.meta`（`importer: "gltf"`）并随目录提交 | `.glb` 头魔数 + 三个 `.meta` 存在；`verify:sync` 绿（uuid 唯一）；`node tools/art3d/greybox.py --check` 重生成字节一致 | `python3 tools/art3d/greybox.py --out apps/Cocos/assets/resources/stage3d` |
| SC0-B3 CDP 探针实测 | `tools/creator-preview/probe-stage3d.mjs`（同 `probe-model.mjs` 形态，⛔ 不改仓内客户端代码）：在预览页运行时 `new Node` + `addComponent(Camera)`（透视、priority 0、visibility DEFAULT、clear SOLID_COLOR）+ `DirectionalLight`；`resources.load("stage3d/greybox-biped", Prefab)` → `instantiate` ×100（`SkeletalAnimation.useBakedAnimation = true`、同材质 instancing）+ `greybox-cube` ×500 + `ParticleSystem` ×1；采样 240 帧 `director.root.frameTime`、`director.root.device.{numDrawCalls,numTris,numInstances,memoryStatus}`；开关 20 次读 `memoryStatus` 回基线；截图证明 UI 仍在上层、HUD 按钮可点；同一探针在 Chrome `--disable-webgl2` 下再跑一遍（SD10：WebGL1 是首版目标） | 五项接缝判据（3d.md 3D-12）逐项 PASS / FAIL；数字 JSON 落 `docs/perf/stage3d/<date>-spike.json` 与 `<date>-spike-webgl1.json`；桌面 WebGL2 / WebGL1 各有 100 蒙皮单位帧时 p95 与退化行为记录；内置管线在两种上下文都能渲出（SD11）；类型桩缺面清单（写进 SC1-B1 的测试头注释） | `node tools/creator-preview/probe-stage3d.mjs`（前置同 creator-preview README） |
| SC0-B4 冻结与回填 | 3d.md §9.2 冻结表逐行由候选变冻结值（clear 方式、保留层位数、体积预算、60fps 判据设备、`AssetLease` deadline、`--perf` 采样窗、基线设备）；3D-ASSETS.md §15 数字冻结；SD9–SD12 已拍板（2026-09-19，3d.md §9.1），本批只回填 SC0 实测（WebGL1 退化行为、内置管线在小游戏构建的可用性、小游戏构建体积）；若内置管线在小游戏不可用 ⇒ 记为新拍板项交用户（回退 legacy）；3d.md §10 登记 SC0 | §9.2 与 §15 无「候选」字样；⛔ 任一接缝判据 FAIL ⇒ 先重估 3d.md 再开 SC1 | 文档提交 |

退出：B1–B4（B0 视用户确认）；tag `sc0-exit`。回滚：探针脚本与灰盒资产可保留，⛔ 无框架代码需回滚。

### SC1 · Stage3D + 类型桩 + 端口 + 夹具页 + 资产闸（波 1，← SC0）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC1-B1 类型桩 3D 面 | `apps/client/cc-stub.d.ts` 与 `client-test-stubs.d.ts` 各补：`Camera`（`ProjectionType` / `ClearFlag` / `rect` / `priority` / `visibility` / `fov` / `screenPointToRay`）、`DirectionalLight`、`Layers.Enum`、`Quat`、`Prefab` / `instantiate`、`resources` / `AssetManager.Bundle`、`SkeletalAnimation`（`useBakedAnimation`）、`SkinnedMeshRenderer` / `SkinnedMeshBatchRenderer`、`ParticleSystem`、`LODGroup`、`Billboard`、`geometry.Ray` / `AABB`、`SceneGlobals` 子项（`skybox / fog / shadows / postSettings / ambient`）、`Tween`；只声明 SC1–SC4 会用到的成员（桩文件头注释既有约定） | `npm run typecheck` 两探针绿；桩变异：删 `Camera` 声明 → SC1-B2 编译红（记进提交信息） | `npm run typecheck` |
| SC1-B2 `Stage3D` 核心（无头） | `apps/client/src/view/scene3d/stage3dLayers.ts`（`STAGE3D_LAYER_CONTENT = Layers.Enum.DEFAULT`、两个框架保留位常量）；`Stage3D.ts`：`Stage3DEngine` 适配器接口 `{ createNode, addCamera, addLight, getSceneGlobals, setSceneGlobals }`、`acquire(owner, options)` / `Stage3DLease`（`root` / `camera.setPose` / `setFov` / `setViewport` / `setClear` / `light.setDirection` / `setColor` / `setShadows` / `setGlobals` / `screenToRay` / `signal` / `release`）、`acquireGlobals(patch)`（栈式，3D-17）、`Stage3DBusy`；视口换算 `designRect → Camera.rect`（`designSpec.ts` 750×1624 / FIXED_WIDTH）放 `logic/scene3d/viewport.ts`（纯函数） | `apps/client/test/stage3d.test.ts`（FakeNode 引擎适配器）：acquire / release 成对；双租约抛 `Stage3DBusy`；`setGlobals` 快照恢复；`acquireGlobals` 栈式恢复顺序；页面 `closeLifecycle` 自动释放；开关 20 次节点数回基线；`viewport.test.ts` 换算。变异：删快照恢复 → 「toneMapping 泄漏」红；删忙判定 → 红；删 release 幂等 → 二次 release 红 | `npm run test:client` |
| SC1-B3 端口接线 + 引擎适配器 + 保护面 | `app/ports.ts` `AppPorts.stage3d: Stage3DPort`；`app/bootstrap.ts` 创建 `Stage3D(new CocosStage3DEngine())`（`view/scene3d/cocosStage3DEngine.ts`：真 `Node` / `Camera` / `DirectionalLight` / `director.getScene().globals`，相机与根挂场景根、priority 0、`scene.scene` 零改动）并注入 `AppPorts`；`apps/client/test/appHostHarness.ts` 提供 fake `stage3d`；**MF9-B2 合入后**：`scripts/protected-paths.json` gameplayFlow 加 `apps/client/src/view/scene3d/Stage3D.ts`、`stage3dLayers.ts` + `node scripts/protected-paths-lock.mjs --write` + Non-intrusive §12.2 散文一句 | `appRuntime.test.ts` 加「ports.stage3d 可达且 dispose 时释放在途租约」；`protectedPaths.test.ts` / `protectedPathsLock.test.ts` 绿；变异：bootstrap 不注入 → appRuntime 用例红 | `npm run test:client`；`npm run verify:protected-paths` |
| SC1-B4 夹具页 `stage3dFixture` | `apps/client/src/view/Stage3dFixtureView.ts`（`CocosView` 子类，`kind:"cocos"`、`interactive:false`、`layer:"base"`、`fullscreen`）+ `Stage3dFixtureView.view.json` + `apps/client/src/logic/page/Stage3dFixtureLogic.ts`（开关计数、视口矩形、假时钟）；`onOpen`：`ports.stage3d.acquire` → 加载 `stage3d/greybox-plane` + `greybox-cube`（经临时直调 `resources.load`，SC3 换 `AssetLease`）→ 相机俯视 → `setViewport` 留出 header / footer；`onCloseLifecycle` 前 release；登记进 `apps/plugins/builtin/plugin.json` 的 `views` + `routes`（同 PromoHome，`codegen:plugins`）；`tools/creator-preview` 加 `stage3d` 剧本（打开 → 平移 → 缩放 → 关闭 ×20，同 `slg.mjs` 形态） | `cocosPages.test.ts` 同法冒烟：挂载后有 root、无 `Graphics`；`stage3dFixture.test.ts`：开关 20 次租约与节点数回基线；Creator 证据两次：WebGL2 与 Chrome `--disable-webgl2`（截图 + console 空 + `memoryStatus` 回基线，SD10） | `npm --workspace @game/server run codegen:plugins`；`npm run sync:client`；`node tools/creator-preview/run.mjs stage3d` |
| SC1-B5 `verify:assets3d` + 登记 | `scripts/verify-assets3d.mjs`（扫 `apps/Cocos/assets/resources/stage3d/**`、`resources/{kits,plugins}/*/3d/**` 与 `apps/Cocos/assets/bundles/*/**`（SD12）：扩展名白名单 glb / png / effect / prefab / json / atlas / skel；`.meta` 存在且 `importer` 匹配（glb → `gltf`，png → `image`，effect → `effect`）；体积 ≤ `art3d.config.json`（框架目录用 `scripts/assets3d.config.json` 缺省：目录 ≤ 64 MB、glb ≤ 8 MB、png ≤ 4 MB）；`.glb` 魔数 / chunk 长度）+ `scripts/verify-assets3d.test.mjs`（临时目录反例）；`package.json` 加 `verify:assets3d` 并挂进 `verify:core` 链；CLAUDE.md 常用命令表加一行；`cp CLAUDE.md AGENTS.md`；`docs/inventory.json` 加能力 `stage3d-runtime`（`sourceOfTruth: apps/client/src/view/scene3d`，verification `test:client` / `verify:assets3d`，docs `docs/3d.md`） | 反例：png 改名 `.jpg` → 红；删 `.meta` → 红；上限调小 → 红；`verify:inventory` 绿；`verify:all` 绿 | `npm run verify:assets3d`；`npm run verify:inventory`；`npm run verify:all` |
| SC1-B7 bundle 目录与所有权（框架 PR，SD12） | `apps/Cocos/assets/bundles/<kit\|plugin>-<id>[-<map>]/` 成为包的 3D 运行时资产目录：`tools/plugin/ownership.ts` 推导规则（kit / plugin 各加 `bundles/<class>-<id>*/`）、`pack.ts` / `install.ts` / `lock.ts` / `check.ts` / `changed.ts` 覆盖该目录（目录 `.meta` 含 `isBundle`）；`builder.json` `bundleConfig` 加平台覆写模板（miniGame `isRemote:true`，native / web 缺省本地，Cyberpunk 同表形态）；`AssetLease` 接口自此定型为「bundle 名 + 路径」（实现在 SC3-B1）；框架 `resources/stage3d/` 不变；KIT.md §2 / PLUGIN.md §5.2 落点表回写 | `plugin -- pack / install / check` 对含 `bundles/kit-kitfix/` 的临时根 kitfix 走通；所有权测试加 bundles 用例；变异：删 bundles 推导规则 → install 所有权冲突转红 | `npm --workspace @game/server run plugin -- check`；`verify:all` |
| SC1-B6 文档 + 退出 | `docs/CLIENT.md` §3 加「3D 页面：租约而不是相机」小节 + §9 新页面清单一条；`docs/KIT.md` §2 硬排除加四条（3d.md §2）；3d.md §10 登记 SC1；lvr-3d.md §8 通知「先例可抄」 | `verify:inventory` 绿 | 文档提交；tag `sc1-exit` |

退出：B1–B7；tag `sc1-exit`。回滚：可回退（新增文件 + `AppPorts` 一个字段 + 所有权规则一处）。

### SC2 · 纯数学（波 2，← SC1）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC2-B1 `lodBands` 落 shared | `apps/shared/src/logic/lodBands.ts`：`lodForValue(value, thresholds)` / `lodForValueStable(prev, value, thresholds, hysteresisRatio)`（零依赖，ES2017）；`apps/shared/src/kits/slg/api/worldmap/index.ts` 的 `slgLodForScale` / `slgLodForScaleStable` 改为调用它（签名不变，`worldmap` api 版本不 bump）；`sync:shared` | `apps/server/test/shared-logic.test.ts` 加滞回用例（阈值附近来回不抖、跨两档、边界相等）；`slg-map-lod.test.ts` 零改动绿；变异：去掉 `(1 ± ratio)` → 「阈值附近抖动」红 | `npm run sync:shared`；`npm --workspace @game/server run test`；`npm run test:client` |
| SC2-B2 `cameraRig` | `apps/client/src/logic/scene3d/cameraRig.ts`：自 `kits/slg/logic/mapCamera.ts` 抽出投影无关部分（指针表、pan / pinch 两指距离比 → zoom 与锚点保持 / wheel / 惯性衰减 / 边界钳制 / `version` 只在实际移动时递增 / `touched`）+ `follow(target)` 跟随模式（为 mmo 预留）；`MapCamera` 改为组合 `CameraRig` + 2D 投影（`pixelsPerGrid`、`visibleRect`），公开 API 不变 | 新 `cameraRig.test.ts`（pinch 锚点保持、惯性、钳制、版本号语义、follow）；`slg-input.test.ts` / `slg-map.test.ts` / `slg-map-lod.test.ts` 零改动绿；变异：锚点换算去掉 → 「pinch 锚点漂移」红 | `npm run test:client` |
| SC2-B3 `chunkStreamer` | `apps/client/src/logic/scene3d/chunkStreamer.ts`：自 `kits/slg/logic/mapStreamer.ts` 泛化，注入 `{ chunkSize, mapWidth, mapHeight, key(x,y), unkey(key), margin, retainMargin }`；`take / takeBatch / accept / reject / defer / current / reset` 语义不变；`MapStreamer` 改为薄包装（注入 slg 的 `chunkKey` / `gridFromTileId` / `SLG_CHUNK_SIZE`） | 新 `chunkStreamer.test.ts`（差分、环形扩张顺序、代次门控、批 4 chunk、defer 回队首）；slg 既有流式用例零改动绿；变异：删 `current()` 代次比对 → 「迟到完成被接受」红 | `npm run test:client` |
| SC2-B4 `pickMath` | `apps/client/src/logic/scene3d/pickMath.ts`：射线–平面（y = h）、射线–AABB、`unprojectDesignPx`（配合 `viewport.ts`）；纯函数 | `pickMath.test.ts`（命中 / 未命中 / 平行 / 反向）；变异：交点参数 t < 0 不剔除 → 红 | `npm run test:client` |
| SC2-B5 文档 + 退出 | `docs/CLIENT.md` §3 Logic 段加「scene3d 纯数学模块」；slg.md §10.8 通知「2b 可消费 lodBands / cameraRig / chunkStreamer」；3d.md §10 登记 SC2 | — | 文档提交；tag `sc2-exit` |

退出：B1–B5；tag `sc2-exit`。回滚：可回退（slg 薄包装保留原签名）。

### SC3 · 资源与实体（波 2，← SC1；与 SC2 并行）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC3-B1 `AssetLease` | `apps/client/src/view/scene3d/AssetLease.ts`：注入 `AssetLoader { load(bundle, path, type, cb), addRef(asset), decRef(asset) }`（生产 = 按「bundle 名 + 路径」：`assetManager.loadBundle` + `bundle.load`，`resources` 只是名为 `resources` 的 bundle；SD12）；`acquire(requests[], { deadlineMs = 15_000, signal }) → Promise<{ assets, release }>`：一路一租约、addRef 于成功回调、失败 / 超时 / 取消整包 release、迟到完成仍 decRef、release 幂等；错误码 `ASSET_MISSING / ASSET_TIMEOUT / ASSET_CANCELLED`（`view/packageLoader.ts` 三态先例） | `assetLease.test.ts`（`slg-art-resources.test.ts` 的 FakeAsset 形态）：成功 / 部分失败整包释放 / 超时 / 取消 / 迟到完成 decRef / 二次 release 无副作用；变异：失败分支不 release → 「迟到完成引用泄漏」红 | `npm run test:client` |
| SC3-B2 `assetPlan` | `apps/client/src/logic/scene3d/assetPlan.ts`：`(lod, visibleChunks, catalog) → { acquire[], release[] }` 差分，出档延迟释放（`graceMs` 注入时钟） | `assetPlan.test.ts`；变异：删延迟释放 → 「进出档抖动」红 | `npm run test:client` |
| SC3-B3 `EntityPool` | `apps/client/src/view/scene3d/EntityPool.ts`：按 prefab 键的 Node 池（`spawn / despawn / setLod`）；两级 LOD 档（近档 prefab / 远档 `Billboard` 或简模）；`hideAtLod` 表；同键共享材质开 instancing；FakeNode 可测 | `entityPool.test.ts`（复用 / 上限 / 档切换 / hideAtLod）；夹具页加「500 灰盒立方体」开关；Creator `--perf` 证据（SC3-B5 后补）| `npm run test:client` |
| SC3-B4 slg 迁移消费 | `kits/slg/view/SlgArtResources.ts` 改为 `AssetLease` 包装（公开 API `loadSlgArtResources` 不变）；`SlgChunkRenderer.ts:29-31,63` / `SlgTilemapRenderer.ts:58-60,144` 的 `postSettings.toneMappingType` 直改改为 `ports.stage3d.acquireGlobals({ toneMapping: "linear" })`（3D-17；经 `SlgMapView` 注入，两个 Renderer 不再 import `director`） | `slg-art-resources.test.ts` 零改动绿；新增「两 Renderer 释放后 toneMapping 恢复」用例；`grep -n "director.getScene" apps/client/src/kits/slg` = 0 | `npm run test:client` |
| SC3-B5 `creator-preview --perf` | `tools/creator-preview/perf.mjs`：注入脚本采样 240 帧（60 帧 warmup）`director.root.frameTime`，每帧读 `director.root.device.numDrawCalls / numTris / numInstances`，结束读 `memoryStatus.{bufferSize,textureSize}`；`run.mjs` 加 `--perf` 开关（任意剧本可挂），结果写进 `report.json.perf` 并另存 `docs/perf/stage3d/<date>-<scenario>.json`（`world-bench` 输出形态）；纯函数（聚合 p50 / p95 / max、JSON 形状）进 `apps/server/test/creator-preview-tool.test.ts` | 聚合函数用例；`stage3d` 剧本 + `--perf` 在 Creator 跑两次出数字（WebGL2 与 `--disable-webgl2`；500 立方体：draw call、三角数、帧时 p95；SD10） | `node tools/creator-preview/run.mjs stage3d --perf` |
| SC3-B6 文档 + 退出 | `docs/CLIENT.md` §8 加「3D 性能证据」小节（`--perf` 用法、⛔ 不是门禁）；3d.md §10 登记 SC3；slg.md §10.8 / lvr-3d.md §8 通知 | — | 文档提交；tag `sc3-exit` |

退出：B1–B6；tag `sc3-exit`。回滚：可回退（slg 包装保留原签名）。

### SC4 · 蒙皮与特效（波 3，← SC2 + SC3）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC4-B1 `SkinnedUnits` | `apps/client/src/view/scene3d/SkinnedUnits.ts`：以 `EntityPool` 为底，prefab 含 `SkeletalAnimation`（`useBakedAnimation = true`）+ `SkinnedMeshRenderer`；同键共享材质 instancing；`play(entity, clip)` / `socket(entity, name)`；需要运行时混合的实体走非烘焙路径（显式 opt-in） | `skinnedUnits.test.ts`（FakeComponent：烘焙开关、clip 切换、socket 解析）；夹具页「100 biped」开关 + `--perf` 数字（桌面 p95 帧时、instances 数）；变异：忘设 `useBakedAnimation` → 用例红 | `npm run test:client`；`node tools/creator-preview/run.mjs stage3d --perf` |
| SC4-B2 `Vfx` | `apps/client/src/view/scene3d/Vfx.ts`：`ParticleSystem` prefab 池；`play(key, at 或 follow)`；按 LOD 档禁用；定时销毁；同键并发上限；随租约 release 全部回收 | `vfx.test.ts`（池复用 / LOD 门 / 定时 / 上限 / 释放）；夹具页「50 特效」开关 + `--perf`；变异：删 LOD 门 → 「远档仍播」红 | `npm run test:client` |
| SC4-B3 WebGL1 / 微信退化（**门**，SD10） | Chrome `--disable-webgl2` 跑 `stage3d --perf`：预烘焙蒙皮（浮点关节贴图）与 instancing 在 WebGL1 的可用性；low 档退化路径实现并有用例（预烘焙不可用 → 实时蒙皮上限 + 公告板远档；instancing 不可用 → 合批数降；ASTC 不可用 → png 回落）；微信开发者工具跑一次 `stage3dFixture`（人工，截图 + 远程 bundle 下载 / 缓存行为 + 体积）；结论写进 3d.md §8 与 3D-ASSETS.md §11 | 报告 `docs/perf/stage3d/<date>-webgl1.json` + 微信证据摘要；退化用例绿；变异：删退化分支 → 「WebGL1 下蒙皮单位不可见」转红 | Creator + Chrome 标志；微信开发者工具 |
| SC4-B4 文档 + 退出 | 3d.md §10 登记 SC4；lvr-3d.md §8 通知「A3 可开工」；若 SD9 = 3D，MMO-PLAN MK1 行加「← SC4」注记（只加注记，⛔ 不改其批次） | — | 文档提交；tag `sc4-exit` |

退出：B1–B4；tag `sc4-exit`。回滚：可回退。

### SC5 · 工具与冻结（波 4，← SC1–SC4）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC5-B1 `tools/art3d/` 骨架 | `README.md`（venv：UnityPy / pygltflib / pillow / numpy）、`art3d.config.schema.json`、`extract.py`（UnityPy → 中间 JSON + 二进制）、`to-gltf.py`（网格 + 骨骼 + 蒙皮 + 动画轨；材质只带 PBR 参数与贴图槽）、`textures.py`（ASTC / ETC2 → png、翻转、sRGB 标记）、`material-map.py`（Unity shader 名 → 消费方 EffectAsset 手工映射表校验，缺映射即报错）、`verify-roundtrip.py`（顶点数 / 包围盒 / 骨骼数 / 动画时长比对）；`greybox.py` 归入同目录；样例配置 `tools/art3d/examples/greybox.config.json`（零 Unity 依赖可跑） | 灰盒样例：`greybox.py` → `verify-roundtrip.py` 全 PASS；一次仓外样本（`../sourceVersion/lvr-1.0.0/` 只读）跑 extract → glb → Creator 导入 → 夹具渲染，证据落 `docs/evidence/creator-<date>/art3d/`（不入库） | `python3 tools/art3d/<step>.py --config <cfg>` |
| SC5-B2 文档回写 + 冻结 | `docs/CLIENT.md` §6 资源动线加 3D 段（源 `apps/kits/<id>/art/3d/` → `.glb` / png → Creator 导入 → `resources/kits/<id>/3d/` + `.meta` → `verify:assets3d`）；KIT.md §2 / §3 落点表；Non-intrusive §12.2；`docs/inventory.json` 能力条目 docs 补 `tools/art3d/README.md`；3d.md §10 登记 SC5、§9 冻结 api（`Stage3DLease` / `AssetLease` / `EntityPool` / `SkinnedUnits` / `Vfx` 签名）；tag `stage3d-v1-frozen` | `verify:inventory` 绿；3d.md §10 有 SC0–SC5 六行 | 文档提交；tag |

退出：B1–B2；tag `stage3d-v1-frozen`。回滚：可回退。

## 4. 消费方接入施工单

### 4.1 `lvr`（lvr-3d.md 需求 → 框架件映射；内容留 kit）

| lvr 阶段 | 前置 | 接什么 | kit 自带 |
| --- | --- | --- | --- |
| A0 可行性（并入 SC0） | SC0-B3 | 用 lvr 样本资产（1 建筑 + 1 单位动画 + 1 海面贴图，经 `tools/art3d` 骨架前身手工 glb）在 `probe-stage3d.mjs` 里跑第二份证据 | 样本资产授权台账起草 |
| A1 场景骨架 | SC1、SC2、SC3 | `ports.stage3d.acquire` + `cameraRig`（俯视角、手感常量进 `apps/shared/src/kits/lvr/api/…`）+ `lodBands`（阈值表 shared 单源）+ `AssetLease` | 海面 EffectAsset、静态地表内容、`art3d.config.json` |
| A2 实体层 | SC3 | `EntityPool` 两级档 + `chunkStreamer` + `assetPlan` | 19 种地图实体的 prefab / LOD 组 / `hideAtLod` 表 |
| A3 单位动画 | SC4 | `SkinnedUnits`（预烘焙 + instancing）；行军线用 `EntityPool` 简模 | 单位模型 / 动画重导出为 glb |
| A4 主城 | SC3、SC4 | `EntityPool` + `Vfx`；三档细节状态机是 kit logic（吃纯度门） | 建筑四态、特效挂点表 |
| A5 特效与表演 | SC4 | `Vfx` 池；Spine 4.2（Creator 原生） | 20–30 个高频特效重建、英雄立绘 |

lvr 侧验收：每阶段 `verify:all` + `test:client`（logic 无头覆盖相机数学 / LOD / 流式差分）+ `tools/creator-preview --perf` 证据落 `docs/evidence/creator-<date>/lvr-3d/`；状态只回写 lvr-3d.md §8。

### 4.2 `mmo` kit（SD9 = C，2026-09-19 拍板）

| 阶段 | 接法 | 与 MMO-PLAN 的交点 |
| --- | --- | --- |
| 首版（MK0–MK1） | 2D 公告板：`UIMeshRenderer` / Sprite + `cameraRig` 跟随 + `lodBands`（只等 SC2）；世界视图经 `WorldPresentation` 适配器接内容，`EntityPool` 键 = presentationId，`cameraRig` 投影无关；`IPresentationMap` 预留可选 `model` 字段（`content` 面 v1 增量） | MK0-B4 ⛔ 不等本轨道（MMO-PLAN MK0-B4 行已加注记）；MK1-B1 客户端预测 / 和解与本轨道无关 |
| 可切 3D（MK1 前评估） | `MmoWorldView` 换 3D 适配器：`onOpen` 取 `ports.stage3d` 租约；实体 = `EntityPool` + `SkinnedUnits`（`IPresentationMap.model` 即池键）；特效 = `Vfx`；相机 = `cameraRig.follow(self)` | 依据 SC3 / SC4 的 `--perf` 数字（含 WebGL1）；若切 3D，MMO-PLAN MK1 行加注记（SC4-B4） |

### 4.3 `slg` 2b 实时视图

保持 2D（SD7）：SC2 退出后 `MapCamera` / `MapStreamer` 已是薄包装（零改动消费）；SC3 退出后 `SlgArtResources` 走 `AssetLease`、两处场景全局直改归 `acquireGlobals`（SC3-B4 已做）。2b 自身仍等 MF5a（slg.md §10.8）。

## 5. 命令速查

```bash
# 每批必跑
npm run verify:all
npm run typecheck && npm run test:client          # 改了 apps/client/** 的批
node scripts/protected-paths-lock.mjs --write     # 只在改了 scripts/protected-paths.json 时（SC1-B3，等 MF9-B2 合入）
cp CLAUDE.md AGENTS.md && npm run verify:inventory # 新增根命令 / 索引行的批
# 夹具页登记（SC1-B4）
npm --workspace @game/server run codegen:plugins && npm run sync:client
# 灰盒资产（SC0-B2）
python3 tools/art3d/greybox.py --out apps/Cocos/assets/resources/stage3d
# 资产闸（SC1-B5 起）
npm run verify:assets3d
# Creator 证据（⛔ 不是门禁；前置见 tools/creator-preview/README.md）
node tools/creator-preview/probe-stage3d.mjs                 # SC0-B3
node tools/creator-preview/run.mjs stage3d --perf            # SC1-B4 起
```

## 6. 施工细化与待回写 3d.md 的点

| # | 细化 | 回写 |
| --- | --- | --- |
| P1 | protected-paths 登记（SC1-B3 子步）排在 MF9-B2 合入之后，避免两轨道同改 `protected-paths.json` + 锁（3D-14） | 3d.md §4 该行加「← MF9-B2」 |
| P2 | 新根命令 `verify:assets3d` 四处同批：脚本 / `package.json` `verify:core` 链 / CLAUDE.md 常用命令表 / `cp` 到 AGENTS.md（3D-15） | 3d.md §5.2 |
| P3 | `lodBands` 落 `apps/shared/src/logic/`，slg 的 `slgLodForScaleStable` 改薄包装（3D-16） | 3d.md §4 表 |
| P4 | `Stage3DPort.acquireGlobals(patch)` 栈式租约，与舞台租约独立（3D-17） | 3d.md §3.2 |
| P5 | 性能计数器钉到 `gfx.Device.numDrawCalls / numTris / numInstances / memoryStatus` 与 `director.root.frameTime`（3D-18） | 3d.md §7 |
| P6 | 灰盒资产由 `tools/art3d/greybox.py` 合成，框架夹具零外部素材（3D-19）；框架资产目录 `apps/Cocos/assets/resources/stage3d/`（3D-22） | 3d.md §4 / §5 / §6.2 |
| P7 | `AppPorts.stage3d` 是端口接缝，`gameplay/services.ts` 不变（3D-13） | 3d.md §3.3 |
| P8 | SD9（mmo 世界视图 2D / 3D）、SD10（WebGL1 / 微信是否首版目标）在 SC0-B4 拍板（3D-21、SC4-B3） | 3d.md §9.1 |
| P9 | lvr-3d.md L01–L09 对齐为消费方需求 v1.1（SC0-B0） | ✅ eef7c1a2 |
| P10 | SD9–SD12 于 2026-09-19 拍板（C / 门 / 引擎内置新管线 / 每包一 bundle）：新增 SC1-B7 bundle 目录与所有权框架 PR；SC4-B3 改为门；SC0-B4 改为冻结与回填；SC0-B1 / B3、SC1-B4 / B5、SC3-B1 / B5 加 WebGL1 与 bundle 口径 | ✅ 3d.md §9.1、3D-ASSETS.md v1.1、本文 §0 / §1 / §3 / §4.2 / §7 / §8 |

## 7. 风险与看护点

- **SC0 是真门**：五项接缝判据任一 FAIL（尤其「UI 相机与 3D 相机叠加」「HUD 输入不被吞」）就回头改 3d.md，⛔ 不带病进 SC1。
- **两轨道并行**：MMO 轨道（MF9 / MF2 / MF5a）与本轨道都动 `apps/client/**` 与 `scripts/protected-paths.json`；本轨道只在 `view/scene3d/`、`logic/scene3d/`、`shared/logic/lodBands.ts`、`app/ports.ts`（一个字段）、`app/bootstrap.ts`（一处注入）落笔，其余路径不碰；protected-paths 只在 SC1-B3 改一次。
- **slg 零改动闸**：SC2-B2 / B3 / SC3-B4 都以「slg 既有测试零改动全绿」为退出条件；一旦要改 slg 测试断言，说明抽取改了语义，回退重做。
- **桩漂移**：类型桩只补用到的成员；Creator 侧真类型仍由预览把关（桩文件头注释既有约定）。
- **显存与机型**：桌面数字不等于手机；`--perf` 报告标注设备与 WebGL 版本；SD10 已拍板小游戏为首版目标 ⇒ 每阶段 WebGL1 证据是退出条件，SC4-B3 是门。
- **资产体积**：`verify:assets3d` 上限在 SC0-B4 冻结后不得静默放大；改数 = 新拍板 + 3d.md §10 登记。
- **Spine 版本切换**：工程级单选，切 4.2 后任何后续 3.8 导出都要重导；今天零用法是切换的最佳时机（SC0-B1）。

## 8. 批次状态（只在本文回写；阶段级完成回写 3d.md §10）

- [x] SC0-B0（eef7c1a2，随 Cyberpunk 校正完成） [ ] SC0-B1 [ ] SC0-B2 [ ] SC0-B3 [ ] SC0-B4
- [ ] SC1-B1 [ ] SC1-B2 [ ] SC1-B3 [ ] SC1-B4 [ ] SC1-B5 [ ] SC1-B7 [ ] SC1-B6
- [ ] SC2-B1 [ ] SC2-B2 [ ] SC2-B3 [ ] SC2-B4 [ ] SC2-B5
- [ ] SC3-B1 [ ] SC3-B2 [ ] SC3-B3 [ ] SC3-B4 [ ] SC3-B5 [ ] SC3-B6
- [ ] SC4-B1 [ ] SC4-B2 [ ] SC4-B3 [ ] SC4-B4
- [ ] SC5-B1 [ ] SC5-B2
- 消费方：[ ] lvr A0（随 SC0-B3） [ ] lvr A1 [ ] lvr A2 [ ] lvr A3 [ ] lvr A4 [ ] lvr A5 ｜ [ ] mmo（按 SD9） ｜ [ ] slg 消费（随 SC2 / SC3）
