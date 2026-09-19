# 3D 实施施工单：SC0–SC5 逐批次 + 消费方接入（lvr / mmo / slg）

> - 日期：2026-09-19；同日 **v1.2** 按三文档交叉审阅修订。依据 [3d.md](3d.md) **v1.2** 与 [3D-ASSETS.md](3D-ASSETS.md) **v1.2**；[lvr-3d.md](../lvr-3d.md) 为消费方需求 v1.1。初稿基线 `f6fad19f`；MF9 已退出（MMO-PLAN §9，MF9-B2 = `745f5ca6`），保护面修改的前置已满足。⛔ 本次只修订文档，未实施 3D 能力、未勾选新批次。
> - 定位：**施工单 + 审阅记录**——§1 保留第二轮审阅（3D-13–3D-22、L01–L09）并追加本轮三文档审阅（3D-23–3D-32），§3–§4 把 3d.md §6 的每个阶段拆成可独立提交、可独立验收的批次（`SCx-Bn`），写清文件落点、机检退出条件与命令。⛔ 本文不是设计真源：机制以 3d.md 为准、素材以 3D-ASSETS.md 为准；施工细化须同步回写对应真源，⛔ 不在本文另立口径。
> - 状态回写：阶段级完成只回写 3d.md §10；**批次级勾选只在本文 §8**；lvr 接入回写 lvr-3d.md §8。⛔ 不进 plan-v5。
> - 形态与纪律照 [MMO-PLAN.md](MMO-PLAN.md)：一批一提交、变异验证进提交信息、夹具只用灰盒、阶段退出打轻量 tag。

## 0. 总览：波次与并行

```text
波 0   SC0 可行性 spike（门）：引擎面清单 + 灰盒导入 → 真实页面输入 / CDP 性能 + 烘焙预制重载 → 冻结数字与回填（SD9–SD12 已于 2026-09-19 拍板）
波 1   SC1 Stage3D + 类型桩 + AppPorts.stage3d + quality / 压缩预设 + overlay 输入 + 夹具页 + verify:assets3d + bundle 所有权（← SC0；MF9 前置已满足）
波 2   SC2 纯数学（lodBands → shared/logic；cameraRig / chunkStreamer / pickMath → client logic/scene3d；slg 改消费）  ‖  SC3 AssetLease + assetPlan + EntityPool + 全局设置租约 + creator-preview --perf（slg 改消费）
波 3   SC4 SkinnedUnits + Vfx + WebGL1 退化实证（← SC2 + SC3）
波 4   SC5 tools/art3d 骨架 / 图片外提 / 离线 LOD + 文档回写 + 冻结 tag stage3d-v1-frozen（← SC1–SC4）
消费方 lvr A1 ← SC1–SC3；lvr A3 ← SC4；lvr A0 并入 SC0（用 lvr 样本资产做第二份证据）
       mmo：SD9 = C（已拍板）：首版 2D 公告板 + 接口 3D-ready，MK0-B4 不等本轨道；MK1 前按 SC3 / SC4 数字（含 WebGL1）决定是否切 3D
       slg 2b：SC2 退出即可消费 lodBands / cameraRig / chunkStreamer；SC3 退出迁 AssetLease + 全局设置租约
```

| 波 | 阶段 | 批次数 | 首个外部受益方 |
| --- | --- | --- | --- |
| 0 | SC0 | 5（另 B0 文档已完成） | 接缝 / 烘焙证据与数字冻结；SD9–SD12 已拍板 |
| 1 | SC1 | 9 | 框架有 3D 夹具页与类型桩；kit 可写 3D View 不再撞桩 |
| 2 | SC2、SC3 | 5 + 6 | slg 2b（纯数学）；slg 现网两处场景全局直改归位 |
| 3 | SC4 | 4 | lvr A3、mmo MK1（按 SD9 后续决定切 3D 时） |
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

### 1.3 三文档交叉审阅（2026-09-19）——3D-23–3D-32

以下结论已在本次 **文档修订** 中采纳；实现仍按 §8 未勾选批次推进，不表示能力已交付。

| 编号 | 严重度 | 问题 | 修订与验收落点 |
| --- | --- | --- | --- |
| 3D-23 | High | 舞台完整快照恢复与独立全局租约并存，交错关闭会覆盖有效设置、复活失效设置 | 3d.md §3.2：统一 token 覆盖表、按基线与有效补丁重算；SC1-B2 正反乱序释放 / 重复释放 / 字段覆盖测试 |
| 3D-24 | High | bundle 裸前缀所有权会让同类包 foo 吞 foobar | 3d.md §4 / 3D-ASSETS.md §2；SC1-B7 精确目录或 id 后连字符边界，含根 .meta；pack / install / check / uninstall 反例 |
| 3D-25 | High | GLB 父路径不能直接按 Prefab 类型加载 | SC0-B2 固定 scene 名并登记 Prefab 子路径，SC0-B3 / SC1-B4 用登记路径；烘焙组合预制用独立 .prefab；3d.md §4 / §6.2 同步 |
| 3D-26 | Medium | 现有最高交互页仲裁会停用下层地图，上层 HUD 与地图不能同时操作 | 3d.md §3.3：非模态 overlay 输入策略；SC0-B3 真实页面 spike，SC1-B9 框架接缝与测试，SC1-B4 夹具消费 |
| 3D-27 | Medium | 施工白名单不含规范要求的材质 / HDR / 动画图，且漏贴图 / 导入 / 授权检查 | SC1-B5 逐项消费 3D-ASSETS.md §13；SC1-B8 创建被引用的纹理压缩预设；正例与每类反例同时进闸 |
| 3D-28 | Medium | GLB 内嵌图片绕过独立贴图规范与预算 | 3D-ASSETS.md §3 / §13：禁止内嵌图片，工具外提独立 PNG；SC1-B5 检查 GLB JSON、图片依赖与子 meta，SC5-B1 转换与反例 |
| 3D-29 | Medium | 画质档位、细节层门控、每帧激活预算未进入施工单 | SC1-B8 实现 quality / qualityTiers；SC3-B2/B3 按档加载与预算执行；low 不加载 details、批量 spawn 分帧且关闭清队列 |
| 3D-30 | Medium | SC5 未实现离线 LOD 仍可打冻结 tag | SC5-B1 增 lod.py 与变体面数 / 材质槽 / 包围盒 / 适用蒙皮动画校验；SC5-B2 必须核对变体证据 |
| 3D-31 | Medium | SC0 漏掉设计要求的静态光烘焙与预制加载验证 | 新 SC0-B5：灰盒烘焙 → apply → 独立预制 → 脱离验收场景动态加载；失败不得退出 SC0 |
| 3D-32 | Medium | 素材规范仍残留首版关闭 custom-pipeline 的相反指令 | 3D-ASSETS.md §1 与 SD11 / SC0-B1 对齐：内置新管线三特性 ON、legacy OFF，禁止的是自研 pass |

## 2. 施工纪律（每一批都适用）

1. **一批 = 一个提交**（提交信息以批次号开头：`SC1-B2：…`），批内 `npm run verify:all` 绿才提交；改了 `apps/client/**` 的批另跑 `npm run typecheck`（两套探针）+ `npm run test:client`；改了 `scripts/protected-paths.json` 的批 `node scripts/protected-paths-lock.mjs --write`；新增根命令的批同批登记 CLAUDE.md 常用命令表并 `cp CLAUDE.md AGENTS.md`（verify-inventory 两道闸，3D-15）。
2. **纯度门**：相机 / LOD / 流式 / 拾取 / 资产计划只在 `apps/client/src/logic/scene3d/**` 或 `apps/shared/src/logic/**`，`logic-purity.test.ts` 自动受门；`view/scene3d/**` 只做 Node / 组件绑定，依赖注入引擎适配器以便 FakeNode 无头测试（`cocosPages.test.ts` 同法）。
3. **变异验证**是退出条件的一部分：每批在测试头注释或提交信息写「改哪一行 → 哪条用例转红」，至少手工执行一次。
4. **夹具纪律**：框架段 ⛔ 不得出现 `apps/kits/lvr/`、海面 / 城建 / 英雄等内容词；只用 `stage3dFixture` 页面与 `tools/art3d/greybox.py` 合成的灰盒资产（`resources/stage3d/greybox-*.glb`）。
5. **Creator 证据 ⛔ 不进自动聚合门禁，但所列阶段证据仍是人工退出条件**：`tools/creator-preview` 的 `stage3d` 剧本与 `--perf` 落 `docs/evidence/creator-<date>/stage3d/`（`.gitignore` 不入库），只把数字摘要写进 `docs/perf/stage3d/<date>-<scenario>.json` 与 3d.md §10。
6. **协议 / 生成物**：本轨道不改 shared protocol / 玩法 wire；输入元数据与夹具登记可经 `codegen:plugins` 刷新对应生成物，再走 sync 镜像，⛔ 手改生成物；仅提交本批登记直接推导的变更。
7. **上游**：Cocos 引擎 API 以本机 `cc.d.ts` 为准，提交信息写「引擎对照：cc.d.ts@3.8.8 <行号>」；⛔ 不 vendored 任何 3D 第三方库（SD4）。
8. **回写**：阶段退出 → 3d.md §10 一行（阶段 / 日期 / commit / 实测数字 / 偏差）+ 本文 §8 勾批次 + 轻量 tag（`sc1-exit` …，SC5 打 `stage3d-v1-frozen`）；SC2 / SC3 退出时通知 slg.md §10.8；SC1 / SC3 / SC4 退出时通知 lvr-3d.md §8。

## 3. 框架阶段施工单

### SC0 · 可行性 spike（门，波 0）

| 批次 | 内容 | 机检退出 / 证据 | 命令 |
| --- | --- | --- | --- |
| SC0-B0 文档对齐 ✅（eef7c1a2） | lvr-3d.md 按 §1.2 L01–L09 改为消费方需求 v1.1；3d.md 按 §1.1 3D-13–3D-22 出 v1.1，并对照 Cocos Cyberpunk 实测校正；素材规范拆到 [3D-ASSETS.md](3D-ASSETS.md) | 表格列数 / 链接机检通过 | 已提交 |
| SC0-B1 引擎面清单 | 打开 `apps/Cocos`：把 `engine.json` 改为显式模块清单（SD11：`custom-pipeline` + `custom-pipeline-builtin-scripts` + `custom-pipeline-post-process` ON、`legacy-pipeline` OFF；关 terrain / tiled-map / dragon-bones / xr / physics / particle-2d 等），确认当前管线（CDP 读 `cc.director.root.pipeline` 构造名）、`project.json` 声明两个保留层位、补 `wechatgame.json` 并做一次微信小游戏构建记录体积（SD10）、UI 相机参数（`scene.scene:172-200`）；Spine 切 4.2 并确认无既有用法；写进 `apps/Cocos/README.md` 新段「引擎模块、管线与相机」 | README 段落存在；小游戏构建产物存在且体积成文；`verify:inventory` 绿（AGENTS / CLAUDE 不变） | 人工 Creator；文档提交 |
| SC0-B2 灰盒资产生成器 | `tools/art3d/greybox.py`（pygltflib + numpy，venv 照 `tools/slg-maps/README.md`）：`greybox-cube.glb`（静态）、`greybox-plane.glb`（地面 64×64、带 UV2）、`greybox-biped.glb`（两骨 skin + 一段 1 s 摆动动画）；各 GLB 的 scene 名固定为主文件名；输出到 `apps/Cocos/assets/resources/stage3d/`，不嵌入图片；Creator 导入生成 `.meta`（`importer: "gltf"`）并记录 `gltf-scene` 子资源路径，例如 `stage3d/greybox-biped/greybox-biped`，写入夹具资源清单；若实际导入命名不同，以导入结果修正清单，⛔ 用 GLB 父路径代替 Prefab 子路径 | GLB 结构与 `.meta` 存在、子路径可加载为 Prefab；`verify:sync` 绿（uuid 唯一）；`python3 tools/art3d/greybox.py --check` 重生成字节一致；框架 `greybox-*` 命名例外写入框架资产配置 | `python3 tools/art3d/greybox.py --out apps/Cocos/assets/resources/stage3d` |
| SC0-B3 CDP 探针实测 | `tools/creator-preview/probe-stage3d.mjs` 驱动隔离 spike 分支中的真实 `CocosView` 地图页、非模态 FGUI HUD 与模态弹窗（sidecar + builtin route + `codegen:plugins`；允许最小输入适配原型与类型桩，正式化见 SC1-B1/B9，⛔ 仅裸建场景 Node 判输入 PASS）；相机 / 灯运行时创建；按 B2 清单 `resources.load(prefabSubPath, Prefab)` → biped ×100（预烘焙 + 同材质 instancing）+ cube ×500 + `ParticleSystem` ×1；验证 HUD 按钮、空白处地图拖拽、拖拽跨 HUD 边界、滚轮命中、弹窗阻断与关闭恢复；采样 240 帧 `director.root.frameTime` 与 device 计数器、开关 20 次回收；WebGL2 / `--disable-webgl2` 各跑一遍 | 接缝判据逐项 PASS / FAIL，输入必须走真实 ViewMgr 仲裁；JSON 落 `docs/perf/stage3d/<date>-spike{,-webgl1}.json`，含 100 单位 p95、退化行为、开关节点 / 引用 / GFX 内存基线；内置管线两上下文可渲；最小桩清单移交 SC1-B1 | `node tools/creator-preview/probe-stage3d.mjs`（前置同 creator-preview README） |
| SC0-B5 烘焙与预制加载（← B1/B2，先于 B4） | 在临时验收场景摆灰盒地面 / 立方体与静态光，LightFX 烘一次 lightmap 并 apply 到 `resources/stage3d/P_Stage3d_Baked.prefab`；烘焙产物及 meta 随预制资产入库；记录操作步骤与 UUID 依赖，关闭验收场景、清掉编辑器场景状态后，在主预览页仅按独立 Prefab 路径加载（⛔ 借用验收场景的 lightmap 数组 / 节点） | 原场景与独立动态加载对照截图一致、无丢贴图 / UUID，WebGL2 / WebGL1 可渲；开关后引用与 GFX 内存回基线；缺任一烘焙依赖必须可定位失败；不能 apply / 重载则 SC0 不退出，先修订规范 | Creator 人工烘焙 + `probe-stage3d.mjs` 烘焙预制场景 |
| SC0-B4 冻结与回填（← B1/B2/B3/B5） | 3d.md §9.2 与 3D-ASSETS.md §15 数字由候选变冻结值；SD9–SD12 已拍板，本批回填 WebGL1 退化、内置管线在小游戏构建的可用性与体积、真实 HUD 输入方案及 B5 烘焙 / apply / 重载结果；不可用则修订设计并记录新拍板项，不带失败进入 SC1；3d.md §10 登记 SC0 | 冻结表无「候选」字样；全部接缝与烘焙预制重载均 PASS；记录探针原型哪些移交 SC1、哪些移除 | 文档提交 |

退出：B1/B2/B3/B5 完成后做 B4（B0 已完成）；tag `sc0-exit`。回滚：隔离 spike 中的临时页面 / 输入适配 / 桩按清单移除或移交 SC1；探针、灰盒与证据可保留；不得把原型记作正式能力。

### SC1 · Stage3D + 类型桩 + 端口 + 夹具页 + 资产闸（波 1，← SC0）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC1-B1 类型桩 3D 面 | `apps/client/cc-stub.d.ts` 与 `client-test-stubs.d.ts` 各补：`Camera`（`ProjectionType` / `ClearFlag` / `rect` / `priority` / `visibility` / `fov` / `screenPointToRay`）、`DirectionalLight`、`Layers.Enum`、`Quat`、`Prefab` / `instantiate`、`resources` / `AssetManager.Bundle`、`SkeletalAnimation`（`useBakedAnimation`）、`SkinnedMeshRenderer` / `SkinnedMeshBatchRenderer`、`ParticleSystem`、`LODGroup`、`Billboard`、`geometry.Ray` / `AABB`、`SceneGlobals` 子项（`skybox / fog / shadows / postSettings / ambient`）、`Tween`；只声明 SC1–SC4 会用到的成员（桩文件头注释既有约定） | `npm run typecheck` 两探针绿；桩变异：删 `Camera` 声明 → SC1-B2 编译红（记进提交信息） | `npm run typecheck` |
| SC1-B2 `Stage3D` 核心（无头） | `view/scene3d/stage3dLayers.ts` 与 `Stage3D.ts`：引擎适配器、单舞台租约、相机 / 灯 / 视口 / 射线接口；舞台 `setGlobals` 与 `acquireGlobals(owner, patch)` 共用 token 覆盖表（3d.md §3.2），首 token 记录场景基线；更新替换自己的补丁且不改变优先级，删除任意 token 后按基线 + 仍有效补丁逐字段重算，⛔ release 写回自己的旧快照；owner 关闭自动删除 token；资源持有接口按 §3.2 注入，`AssetLease.ts` 在本批先交付内部同步 loaded-asset 引用边界（测试用 FakeRetainer、无加载 I/O），SC3-B1 再补异步加载 / 超时 / 取消；`logic/scene3d/viewport.ts` 做设计矩形换算 | FakeNode：单舞台忙拒、生命周期自动释放、幂等；舞台与独立全局 token 两种乱序释放 / 同字段覆盖 / 不同字段合并 / 更新不抢优先级 / 最后释放回基线 / 失败回滚；资源不提前释放；20 次开关回基线。变异：任一 release 改回旧快照 → 交错关闭测试红 | `npm run test:client` |
| SC1-B3 端口接线 + 引擎适配器 + 保护面 | `app/ports.ts` `AppPorts.stage3d: Stage3DPort`；`app/bootstrap.ts` 创建 `Stage3D(new CocosStage3DEngine())`（`view/scene3d/cocosStage3DEngine.ts`：真 `Node` / `Camera` / `DirectionalLight` / `director.getScene().globals`，相机与根挂场景根、priority 0、`scene.scene` 零改动）并注入 `AppPorts`；`apps/client/test/appHostHarness.ts` 提供 fake `stage3d`；**MF9-B2 前置已满足**：`scripts/protected-paths.json` gameplayFlow 加 `apps/client/src/view/scene3d/Stage3D.ts`、`stage3dLayers.ts` + `node scripts/protected-paths-lock.mjs --write` + Non-intrusive §12.2 散文一句 | `appRuntime.test.ts` 加「ports.stage3d 可达且 dispose 时释放在途租约」；`protectedPaths.test.ts` / `protectedPathsLock.test.ts` 绿；变异：bootstrap 不注入 → appRuntime 用例红 | `npm run test:client`；`npm run verify:protected-paths` |
| SC1-B8 画质、预设与验收场景（← B1/B3） | `view/scene3d/quality.ts` 读平台 / GPU / 能力，`logic/scene3d/qualityTiers.ts` 纯函数返回 low / medium / high 与特性开关；未知移动 GPU / WebGL1 / 微信归 low，dev URL 覆写不得虚构硬件能力；`ports.stage3d.quality` 接线；定义并校验 `quality/pool/detail-layers` 数据表形状，示例在框架资源目录；builder.json 登记 `3d-default/3d-alpha` 平台压缩预设及 PNG 回落；创建不入构建的 `stage3d-dev.scene`，复用 SC0-B5 烘焙工作流 | qualityTiers 测平台 / GPU / 未知 / dev 覆写、production 拒覆写、特性能力钳制；低档阈值为 SC0 冻结表；预设引用能解析、无 ASTC 时选 PNG；验收场景可独立加载预制且构建列表排除；两套 typecheck 绿 | `npm run test:client`；`npm run typecheck`；Creator 预设与场景验证 |
| SC1-B9 非模态 HUD 输入（← SC0-B3） | 将 spike 结论正式落入 `view/defineView.ts` 的 `ViewMeta.inputMode?: "modal" \| "overlay"`（默认 modal，仅 interactive FGUI 可 overlay）、sidecar 校验 / `apps/server/tools/plugin-codegen/` 登记输出、`ViewMgr.ts` / `FguiView.ts` / `CocosView.ts` 与框架输入适配器；最高 modal 决定阻断边界，overlay 不暂停下层世界；HUD 只命中控件、空白穿透，pointer 以起点锁定归属直到结束 / 取消，wheel 按当前命中；关闭 / 重挂 / 模态抢占清理在途 pointer；⛔ 改 vendor | 既有默认仲裁测试零改动绿；新混合输入序列：HUD 点击无世界事件、空白拖拽无 HUD 事件、跨边界不截断、wheel 命中分流、打开弹窗取消并阻断世界、关闭恢复但不补 click 或续接旧拖拽、root 重建清理；非法 sidecar 拒绝；真实 Creator WebGL2/WebGL1 证据；更新受保护路径锁 | `codegen:plugins`；`npm run sync:client`；`npm run test:client`；`npm run verify:protected-paths` |
| SC1-B4 夹具页 `stage3dFixture`（← B8/B9） | `Stage3dFixtureView.ts`（CocosView，`interactive:false`、base、fullscreen）+ sidecar + `logic/page/Stage3dFixtureLogic.ts`；经 `ports.stage3d.acquire` 取舞台，按 SC0-B2 清单加载 plane / cube 的 Prefab 子资源（SC3 前临时框架 loader 使用 B2 同步 retainer 统一引用，SC3 换完整 AssetLease）；引用 B8 验收场景产出的独立烘焙预制；header / footer HUD 用 B9 overlay FGUI 夹具，弹窗用默认 modal；登记 builtin routes / sidecar、生成注册表；关闭先撤场景引用再释放资产；`tools/creator-preview` 的 stage3d 剧本覆盖输入与开关 | 无头与真实页面均验 HUD 点击 / 空白拖拽 / 指针跨 HUD / 模态阻断恢复；20 次节点与引用回基线；WebGL2 / WebGL1 截图、console 与 GFX 内存证据；load 失败 / 页面提前关闭能回收。变异：overlay 参与 modal top 选择 → 地图输入用例红 | `codegen:plugins`；`npm run sync:client`；`npm run test:client`；`node tools/creator-preview/run.mjs stage3d` |
| SC1-B7 bundle 目录与所有权（框架 PR，SD12） | `apps/Cocos/assets/bundles/<class>-<id>[-<map>]/` 推导精确目录：根名等于 `<class>-<id>`，或以 `<class>-<id>-` 开头且地图后缀非空、符合单段命名规则；⛔ 裸 `<class>-<id>*`，包 id 仍遵守既有不含连字符的规则；目录 `.meta` 随同归属，子树不能跨包；`apps/server/tools/plugin/{ownership,pack,install,uninstall,lock,check,changed}.ts` 全链覆盖；builder.json 平台覆写（小游戏 remote、native/web 缺省本地）；AssetLease 接口固定 bundle 名 + 路径；KIT/PLUGIN 落点表回写 | 临时根同时放同类 foo / foobar：各自 pack / install / check 仅认本包及 `<id>-<map>`，根 meta 同规；伪装包写 foobar 拒绝；卸载 foo 保留 foobar；changed 不混所有者。变异：去掉 id 边界 → 越界反例红；`verify:all` 绿 | `npm --workspace @game/server run plugin -- check`；`npm run verify:all` |
| SC1-B5 `verify:assets3d` + 登记（← B7 所有权 / B8 压缩预设） | `scripts/verify-assets3d.mjs` 扫 `resources/stage3d/**`、`resources/{kits,plugins}/*/3d/**` 与 `bundles/*/**`，按包身份精确归属（含根 meta）并完整消费 3D-ASSETS.md §13：白名单 glb / fbx（登记例外）/ png / hdr / effect / mtl / prefab / anim / animgraph / animask / json / atlas / skel；`.meta` 与 importer / 子 meta；GLB 魔数 / chunk / JSON、禁止内嵌图像、图片 URI 包内闭合；POT / 尺寸 / 线性色彩与 mip / 压缩预设；模型导入选项与例外；命名、逐文件与逐包预算、源侧 config / LICENSES 文件覆盖；框架配置 `scripts/assets3d.config.json` 登记灰盒例外；测试 + package.json verify:core + CLAUDE/AGENTS 命令表 + inventory 同批 | 合规 `.mtl/.hdr/.animgraph/.animask` 正例通过；各类反例：改扩展 / 删 meta / 关 mip / 缺压缩预设 / 错导入项 / 无授权记录 / 超预算 / GLB 内嵌或 data URI 图片 / 依赖越界分别红；不以扩大白名单绕过 importer 校验；`verify:inventory` 与 `verify:all` 绿 | `npm run verify:assets3d`；`npm run verify:inventory`；`npm run verify:all` |
| SC1-B6 文档 + 退出（← B1–B5/B7–B9） | CLIENT.md §3/§9 补租约、非模态 HUD 与画质消费；KIT.md §2 硬排除按 3d.md §2 同步；view/README 与 sidecar 说明登记 inputMode 默认值 / 限制；3d.md §10 登记 SC1、lvr-3d.md §8 通知先例；核对 globals / quality / overlay / bundle / 资产闸交付齐全 | `verify:inventory` 与 `verify:all` 绿；B4 在 WebGL2 / WebGL1 的整套输入与生命周期证据齐全 | 文档提交；tag `sc1-exit` |

退出：B1–B5/B7–B9 完成后做 B6；tag `sc1-exit`。回滚：按批次反序回退舞台、输入接缝、登记生成物、settings 与所有权规则；保留默认 modal 兼容基线。

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
| SC3-B2 `assetPlan` | `logic/scene3d/assetPlan.ts`：`(quality, lod, visibleChunks, catalog) → { acquire[], release[] }` 差分，先按 `quality.json` / `detail-layers.json` 剔除禁用细节层，再按 LOD 选变体；出档延迟释放（graceMs 注入时钟），页面关闭立即清理 | 差分 / 滞回 / 时钟测试；low 的 acquire 集不含 details，切档产生正确差分；变异：删除画质过滤或延迟释放 → 对应用例红 | `npm run test:client` |
| SC3-B3 `EntityPool` | `view/scene3d/EntityPool.ts`：按 prefab 键的 Node 池，近主文件 / 远离线简模或 Billboard、hideAtLod、共享材质 instancing；消费 SC1-B8 quality、pool / detail-layers 数据；大批 spawn 入队，激活预算按档每帧最多 N 个，despawn / 切 LOD / 页面关闭取消过时代次队列，inactive 池节点仍持有资产直至淘汰销毁；细节层与 SC3-B2 加载计划一致 | FakeNode：复用 / 上限 / LOD / hideAtLod、500 次 spawn 不突破逐帧 N、关闭后无迟到激活、低档 details 不加载也不激活、淘汰后释放引用；夹具 500 灰盒开关 + SC3-B5 各画质性能证据。变异：直接同步激活全部 → 预算测试红 | `npm run test:client` |
| SC3-B4 slg 迁移消费与全局引用接线 | `kits/slg/view/SlgArtResources.ts` 改为 AssetLease 包装（公开 API 不变）；两个 Renderer 的 toneMapping 直改经 SlgMapView 注入，使用 `ports.stage3d.acquireGlobals(owner, { toneMapping: "linear" })`；SC1 全局资源持有接口接入完整 AssetLease（含补丁被覆盖期间的持有，先移除场景引用再释放资产），删除夹具临时框架 loader | slg 既有资源测试零改动绿；两 Renderer 正反顺序释放、与舞台交错关闭均保留有效值并最终回基线；全局资源替换 / 失败 / 页面关闭测试；`rg "director.getScene" apps/client/src/kits/slg` 无匹配 | `npm run test:client` |
| SC3-B5 `creator-preview --perf` | `tools/creator-preview/perf.mjs`：注入脚本采样 240 帧（60 帧 warmup）`director.root.frameTime`，每帧读 `director.root.device.numDrawCalls / numTris / numInstances`，结束读 `memoryStatus.{bufferSize,textureSize}`；`run.mjs` 加 `--perf` 开关（任意剧本可挂），结果写进 `report.json.perf` 并另存 `docs/perf/stage3d/<date>-<scenario>.json`（`world-bench` 输出形态）；纯函数（聚合 p50 / p95 / max、JSON 形状）进 `apps/server/test/creator-preview-tool.test.ts` | 聚合函数用例；`stage3d` 剧本 + `--perf` 在 Creator 跑两次出数字（WebGL2 与 `--disable-webgl2`；500 立方体：draw call、三角数、帧时 p95；SD10） | `node tools/creator-preview/run.mjs stage3d --perf` |
| SC3-B6 文档 + 退出 | `docs/CLIENT.md` §8 加「3D 性能证据」小节（`--perf` 用法、⛔ 不进自动聚合门禁）；3d.md §10 登记 SC3；slg.md §10.8 / lvr-3d.md §8 通知 | — | 文档提交；tag `sc3-exit` |

退出：B1–B6；tag `sc3-exit`。回滚：可回退（slg 包装保留原签名）。

### SC4 · 蒙皮与特效（波 3，← SC2 + SC3）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC4-B1 `SkinnedUnits` | `apps/client/src/view/scene3d/SkinnedUnits.ts`：以 `EntityPool` 为底，prefab 含 `SkeletalAnimation`（`useBakedAnimation = true`）+ `SkinnedMeshRenderer`；同键共享材质 instancing；`play(entity, clip)` / `socket(entity, name)`；需要运行时混合的实体走非烘焙路径（显式 opt-in） | `skinnedUnits.test.ts`（FakeComponent：烘焙开关、clip 切换、socket 解析）；夹具页「100 biped」开关 + `--perf` 数字（桌面 p95 帧时、instances 数）；变异：忘设 `useBakedAnimation` → 用例红 | `npm run test:client`；`node tools/creator-preview/run.mjs stage3d --perf` |
| SC4-B2 `Vfx` | `apps/client/src/view/scene3d/Vfx.ts`：`ParticleSystem` prefab 池；`play(key, at 或 follow)`；按 LOD 档禁用；定时销毁；同键并发上限；随租约 release 全部回收 | `vfx.test.ts`（池复用 / LOD 门 / 定时 / 上限 / 释放）；夹具页「50 特效」开关 + `--perf`；变异：删 LOD 门 → 「远档仍播」红 | `npm run test:client` |
| SC4-B3 WebGL1 / 微信退化（**门**，SD10） | Chrome `--disable-webgl2` 跑 `stage3d --perf`：预烘焙蒙皮（浮点关节贴图）与 instancing 在 WebGL1 的可用性；low 档退化路径实现并有用例（预烘焙不可用 → 实时蒙皮上限 + 公告板远档；instancing 不可用 → 合批数降；ASTC 不可用 → png 回落）；微信开发者工具跑一次 `stage3dFixture`（人工，截图 + 远程 bundle 下载 / 缓存行为 + 体积）；结论写进 3d.md §8 与 3D-ASSETS.md §11 | 报告 `docs/perf/stage3d/<date>-webgl1.json` + 微信证据摘要；退化用例绿；变异：删退化分支 → 「WebGL1 下蒙皮单位不可见」转红 | Creator + Chrome 标志；微信开发者工具 |
| SC4-B4 文档 + 退出 | 3d.md §10 登记 SC4；lvr-3d.md §8 通知「A3 可开工」；若按 SD9 后续评估决定切 3D，MMO-PLAN MK1 行加「← SC4」注记（只加注记，⛔ 不改其批次） | — | 文档提交；tag `sc4-exit` |

退出：B1–B4；tag `sc4-exit`。回滚：可回退。

### SC5 · 工具与冻结（波 4，← SC1–SC4）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC5-B1 `tools/art3d/` 骨架与离线 LOD | README（venv：UnityPy / pygltflib / pillow / numpy；固定版本的 meshoptimizer 离线工具及获取 / 完整性校验步骤，⛔ 进客户端运行时）、配置 schema、extract.py、to-gltf.py（网格 / 骨骼 / 动画 / PBR）、textures.py（转 PNG、外提 GLB 内嵌图像、按规范命名并重写包内相对 URI）、material-map.py；新增 lod.py（meshopt simplify 按材质 primitive 产 `lod_1/lod_2.glb`，保持材质槽、坐标 / UV / 法线；蒙皮属性与动画不能保真时明确拒绝并要求手工变体，不静默丢弃）；verify-roundtrip.py 分别校验主模型往返与变体面数目标 / 包围盒容差 / 槽位 / 适用骨骼权重和动画时长；灰盒含可简化网格与贴图样本 | 灰盒全链：主模型 → 独立 PNG → 主 GLB + 两档 LOD → Creator 导入 → 夹具切档；主模型往返与 LOD 专项均 PASS，GLB 无内嵌图片、URI 闭合；变异：缺 LOD / 面数未降 / 错槽位 / 丢骨骼或动画 → 对应测试红；仓外样本只读转换证据另存、不入库 | `python3 tools/art3d/<step>.py --config <cfg>`；`npm run verify:assets3d` |
| SC5-B2 文档回写 + 冻结 | CLIENT.md §6 资源动线：源 art/3d → 主 GLB / 离线 LOD / 独立 PNG → Creator 导入到 `bundles/<class>-<id>/3d/` + meta（小数据仍 resources）→ 资产闸 / 验收；KIT.md 落点表、Non-intrusive 接缝、inventory 工具文档更新；核对 quality / 全局租约 / overlay / 烘焙预制 / bundle / 离线 LOD 的实现与证据，3d.md §10 登记并冻结 API | SC0–SC5 状态与证据完整，尤其 SC0-B5 烘焙与 SC5-B1 LOD / 图片外提不缺项；`verify:inventory` / `verify:all` 绿 | 文档提交；tag `stage3d-v1-frozen` |

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

保持 2D（SD7）：SC2 退出后 `MapCamera` / `MapStreamer` 已是薄包装（零改动消费）；SC3 退出后 `SlgArtResources` 走 `AssetLease`、两处场景全局直改归 `acquireGlobals`（由 SC3-B4 实施）。2b 自身仍等 MF5a（slg.md §10.8）。

## 5. 命令速查

```bash
# 每批必跑
npm run verify:all
npm run typecheck && npm run test:client          # 改了 apps/client/** 的批
node scripts/protected-paths-lock.mjs --write     # 只在改了 scripts/protected-paths.json 时（SC1-B3 / B9；新增路径或修改已保护接缝均按锁规则执行）
cp CLAUDE.md AGENTS.md && npm run verify:inventory # 新增根命令 / 索引行的批
# 输入登记与夹具页（SC1-B9 / B4）
npm --workspace @game/server run codegen:plugins && npm run sync:client
# 灰盒资产（SC0-B2）
python3 tools/art3d/greybox.py --out apps/Cocos/assets/resources/stage3d
# 资产闸（SC1-B5 起）
npm run verify:assets3d
# Creator 证据（⛔ 不是门禁；前置见 tools/creator-preview/README.md）
node tools/creator-preview/probe-stage3d.mjs                 # SC0-B3
node tools/creator-preview/run.mjs stage3d                   # SC1-B4 起
node tools/creator-preview/run.mjs stage3d --perf            # SC3-B5 起
```

## 6. 施工细化与待回写 3d.md 的点

| # | 细化 | 回写 |
| --- | --- | --- |
| P1 | MF9-B2 前置已满足；SC1-B3 新增保护路径、B9 修改输入接缝，各批按实际 diff 重钉锁（3D-14） | ✅ 3d.md §4 |
| P2 | 新根命令 `verify:assets3d` 四处同批：脚本 / `package.json` `verify:core` 链 / CLAUDE.md 常用命令表 / `cp` 到 AGENTS.md（3D-15） | 3d.md §5.2 |
| P3 | `lodBands` 落 `apps/shared/src/logic/`，slg 的 `slgLodForScaleStable` 改薄包装（3D-16） | 3d.md §4 表 |
| P4 | `Stage3DPort.acquireGlobals(owner, patch)` 与舞台共用 token 覆盖表，乱序删除后重算（3D-17 / 3D-23） | ✅ 3d.md §3.2；实现 SC1-B2 |
| P5 | 性能计数器钉到 `gfx.Device.numDrawCalls / numTris / numInstances / memoryStatus` 与 `director.root.frameTime`（3D-18） | 3d.md §7 |
| P6 | 灰盒资产由 `tools/art3d/greybox.py` 合成，框架夹具零外部素材（3D-19）；框架资产目录 `apps/Cocos/assets/resources/stage3d/`（3D-22） | 3d.md §4 / §5 / §6.2 |
| P7 | `AppPorts.stage3d` 是端口接缝，`gameplay/services.ts` 不变（3D-13） | 3d.md §3.3 |
| P8 | SD9 / SD10 已拍板；SC0-B4 只做实测冻结与回填（3D-21、SC4-B3） | ✅ 3d.md §9.1 |
| P9 | lvr-3d.md L01–L09 对齐为消费方需求 v1.1（SC0-B0） | ✅ eef7c1a2 |
| P10 | SD9–SD12 于 2026-09-19 拍板（C / 门 / 引擎内置新管线 / 每包一 bundle）：新增 SC1-B7 bundle 目录与所有权框架 PR；SC4-B3 改为门；SC0-B4 改为冻结与回填；SC0-B1 / B3、SC1-B4 / B5、SC3-B1 / B5 加 WebGL1 与 bundle 口径 | ✅ 3d.md §9.1、3D-ASSETS.md v1.1、本文 §0 / §1 / §3 / §4.2 / §7 / §8 |

## 7. 风险与看护点

- **SC0 是真门**：任一接缝判据 FAIL（尤其「UI 相机与 3D 相机叠加」「HUD 输入不被吞」）就回头改 3d.md，⛔ 不带病进 SC1。
- **两轨道并行**：框架实现按本表文件落点推进；SC1-B9 显式授权输入 / sidecar / codegen 接缝改造，SC1-B7 是包所有权改造，SC1-B8 是画质 / settings / 验收场景；不得以旧的「只改 app 一个字段」约束漏掉这些批次。MF9 已退出，后续仍须检查其他轨道对同一保护面 / 锁的变更，B3/B9 各自按实际 diff 重钉。
- **slg 零改动闸**：SC2-B2 / B3 / SC3-B4 都以「slg 既有测试零改动全绿」为退出条件；一旦要改 slg 测试断言，说明抽取改了语义，回退重做。
- **桩漂移**：类型桩只补用到的成员；Creator 侧真类型仍由预览把关（桩文件头注释既有约定）。
- **显存与机型**：桌面数字不等于手机；`--perf` 报告标注设备与 WebGL 版本；SD10 已拍板小游戏为首版目标 ⇒ 每阶段 WebGL1 证据是退出条件，SC4-B3 是门。
- **资产体积**：`verify:assets3d` 上限在 SC0-B4 冻结后不得静默放大；改数 = 新拍板 + 3d.md §10 登记。
- **Spine 版本切换**：工程级单选，切 4.2 后任何后续 3.8 导出都要重导；今天零用法是切换的最佳时机（SC0-B1）。

## 8. 批次状态（只在本文回写；阶段级完成回写 3d.md §10）

- [x] SC0-B0（eef7c1a2，随 Cyberpunk 校正完成） [ ] SC0-B1 [ ] SC0-B2 [ ] SC0-B3 [ ] SC0-B5 [ ] SC0-B4
- [ ] SC1-B1 [ ] SC1-B2 [ ] SC1-B3 [ ] SC1-B8 [ ] SC1-B9 [ ] SC1-B4 [ ] SC1-B7 [ ] SC1-B5 [ ] SC1-B6
- [ ] SC2-B1 [ ] SC2-B2 [ ] SC2-B3 [ ] SC2-B4 [ ] SC2-B5
- [ ] SC3-B1 [ ] SC3-B2 [ ] SC3-B3 [ ] SC3-B4 [ ] SC3-B5 [ ] SC3-B6
- [ ] SC4-B1 [ ] SC4-B2 [ ] SC4-B3 [ ] SC4-B4
- [ ] SC5-B1 [ ] SC5-B2
- 消费方：[ ] lvr A0（随 SC0-B3） [ ] lvr A1 [ ] lvr A2 [ ] lvr A3 [ ] lvr A4 [ ] lvr A5 ｜ [ ] mmo（按 SD9） ｜ [ ] slg 消费（随 SC2 / SC3）

- 2026-09-19 文档 v1.2：采纳 §1.3 的 3D-23–3D-32；新增 SC0-B5、SC1-B8/B9，补齐全局租约、输入、画质、资产闸与离线 LOD 的施工及退出条件。仅文档修订，以上未勾选项仍未实施。
