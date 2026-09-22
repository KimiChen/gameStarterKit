# 3D 实施施工单：SC0–SC5 逐批次 + 消费方接入（lvr / mmo / slg）

> - 日期：2026-09-19；同日 **v1.2** 按三文档交叉审阅修订，**v1.3** 采纳第四轮审阅 3D-33–3D-40（§1.4）；**v1.4（2026-09-22）** 采纳第五轮审阅（§1.5）；**v1.5（2026-09-22）** 按当前范围精简平台验收条目，现行第五轮审阅为 3D-41–3D-45、3D-47。依据 [3d.md](3d.md) **v1.5** 与 [3D-ASSETS.md](3D-ASSETS.md) **v1.5**；[lvr-3d.md](../lvr-3d.md) 为消费方需求 v1.5。初稿基线 `f6fad19f`；MF9 已退出（MMO-PLAN §9，MF9-B2 = `745f5ca6`），保护面修改的前置已满足。v1.5 为设计基线；SC0 已于2026-09-22完成预算冻结与原型移交，批次进度只在 §8 登记；政策上限与实测覆盖分列在3D-ASSETS §15。
> - 定位：**施工单 + 审阅记录**——§1 保留历次审阅（3D-13–3D-45、3D-47、L01–L09），§3–§4 把 3d.md §6 的每个阶段拆成可独立提交、可独立验收的批次（`SCx-Bn`），写清文件落点、机检退出条件与命令。⛔ 本文不是设计真源：机制以 3d.md 为准、素材以 3D-ASSETS.md 为准；施工细化须同步回写对应真源，⛔ 不在本文另立口径。
> - 状态回写：阶段级完成只回写 3d.md §10；**批次级勾选只在本文 §8**；lvr 接入回写 lvr-3d.md §8。⛔ 不进 plan-v5。
> - 形态与纪律照 [MMO-PLAN.md](MMO-PLAN.md)：一批一提交、变异验证进提交信息、夹具只用灰盒、阶段退出打轻量 tag。

## 0. 总览：波次与并行

```text
波 0   SC0 可行性 spike（门）：引擎面清单 + 灰盒导入 → 真实页面输入 / CDP 性能 + 烘焙预制重载 → 冻结数字与回填（SD9–SD12 已于 2026-09-19 拍板）
波 1   SC1 Stage3D + 类型桩 + AppPorts.stage3d + quality / 压缩预设 + overlay 输入 + 夹具页 + verify:assets3d + bundle 所有权（← SC0；MF9 前置已满足）
波 2   SC2 纯数学（lodBands → shared/logic；cameraRig / chunkStreamer / pickMath → client logic/scene3d；slg 改消费）  ‖  SC3 AssetLease + assetPlan + EntityPool + 全局设置租约 + creator-preview --perf（slg 改消费）
波 3   SC4 SkinnedUnits + Vfx + WebGL1 退化实证（← SC2 + SC3）
波 4   SC5 tools/art3d 骨架 / 图片外提 / 离线 LOD + 文档回写 + 冻结 tag stage3d-v1-frozen（← SC1–SC4）
消费方 lvr A1 ← SC1–SC3；lvr A3 ← SC4；lvr A0 并入 SC0（用 lvr 样本资产做第二份证据）；**lvr = SD10 首发小游戏 / WebGL1 消费方**（lvr-3d.md R0：A1–A5 每阶段附 WebGL1 证据、A3 加真实微信设备缓存证据、等 SC4-B3 门）
       mmo：SD9 = C；已有 mmo kit v1 的 2D 基线已冻结，后续按 SC2 / SC1-B9 消费纯数学与非模态 HUD；3D 是依据 SC3 / SC4 数字（含 WebGL1）另行评估的可选增量，不倒改已退出的 MK 阶段
       slg 2b：SC2 退出即可消费 lodBands / cameraRig / chunkStreamer；SC3 退出迁 AssetLease + 全局设置租约
```

| 波 | 阶段 | 批次数 | 首个外部受益方 |
| --- | --- | --- | --- |
| 0 | SC0 | 5（另 B0 文档已完成） | 接缝 / 烘焙证据与数字冻结；SD9–SD12 已拍板 |
| 1 | SC1 | 9 | 框架有 3D 夹具页与类型桩；kit 可写 3D View 不再撞桩 |
| 2 | SC2、SC3 | 5 + 6 | slg 2b（纯数学）；slg 现网两处场景全局直改归位 |
| 3 | SC4 | 4 | lvr A3、mmo 已冻结 2D 基线之后的可选 3D 接入 |
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
| 3D-18 | Medium | §7 / §4 | 性能证据只写「帧时 / draw call / 三角数 / GFX 内存」，没钉到引擎 API，探针写不出来 | `cc.d.ts:8243-8263,9656-9703` `gfx.Device.numDrawCalls / numTris / numInstances / memoryStatus`；`:7906-7911` `director.root.frameTime / frameCount`；`tools/creator-preview/probe-model.mjs` 已有 `_collectModels` 读法 | SC3-B5 `--perf` 用这五个计数器，采样窗 240 帧 + 60 帧 warmup（同 `perf:client`）；回写 3d.md §7；历史采样口径已由 3D-45 修正 |
| 3D-19 | Medium | §6.2 SC0 | SC0 要「一个灰盒 `.glb` + 一个蒙皮单位」但仓内零 3D 资产，也没说资产从哪来；用 lvr 原作资产做框架 spike 会把授权与 Unity 抽取的不确定性混进「门」 | `find apps/Cocos/assets -name '*.glb'` 为空；lvr-3d §6 素材授权行 | SC0-B2 `tools/art3d/greybox.py`（pygltflib 纯合成：立方体、地面、两骨 biped + 一段动画），零授权问题；lvr 样本资产只做 A0 的第二份证据；回写 3d.md §6.2 |
| 3D-20 | Low | §5.1 | Spine 4.2 是**工程级单选**（`spine-3.8` / `spine-4.2` 特性互斥），文中未说明切换影响面 | `engine/cc.config.json` features；仓内无 `sp.Skeleton` 用法 | 原假设“零用法”已由 SC0 实测推翻：登录 FGUI loader3D 使用 3.8.99；按用户确认归档原素材、导出原姿态静态图并重发 Login，再切 4.2 验证；SC0-B1 记录于 `apps/Cocos/README.md` |
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

### 1.4 第四轮审阅（2026-09-19，对 v1.2 三文档）——3D-33–3D-40

以下已随本次 **v1.3 文档修订** 采纳；实现仍按 §8 未勾选批次推进。

| 编号 | 严重度 | 问题 | 修订与验收落点 |
| --- | --- | --- | --- |
| 3D-33 | Medium | SD9 = C 写成「只等 SC2」，但 mmo 默认 HUD 是 FGUI（MMO.md §7.6），世界是 gameplay presentation 节点，用全局 `input.on`（`SnakeWorldView.ts:170-173`）——点 HUD 时世界也收到触摸；首版 2D 同样依赖输入归属 | 3d.md §3.2 / §3.3 / §6.1 / §6.3 / §9.1、MMO.md §7.6 / §12、MMO-PLAN MK0-B4：依赖改「SC2 + SC1-B9（gameplay 载体闸）」，退路 = HUD 画在世界节点内；SC0-B3 用既有 snake 局验第二载体；SC1-B9 加 `GameplayPresentationHost` 输入闸；后置输入闸已由 3D-41 改为 raw-input 前置分流，消费方时间线以 §4.2 为准 |
| 3D-34 | Medium | 租约 owner 绑死 `ViewLifecycleContext`、端口只挂 `AppPorts`，gameplay 模块拿不到（它拿 `GameplayServicesContext`） | 3d.md §3.2 `Stage3DOwner { signal; isActive() }` 最小接口；§3.3 第二入口 `GameplayServicesContext.stage3d`（同一实例；部分修正 3D-13）；SC1-B3 注入两处 |
| 3D-35 | Medium | SC0-B3 原型体量 ≈ SC1-B9，「门」变成半个实施 | SC0-B3 加规模上限（只改 `syncInput` 一处 + 一个 overlay 标记 + presentation host 一处闸）与时间盒（候选 3 人日），超出即停并记 3d.md §8；历史原型范围已由 3D-41 放宽为固定夹具的最小完整状态机 |
| 3D-36 | Low | SC1-B2 提前实现 AssetLease 同步 retainer，只为资源型全局 patch | SC1 全局 patch 只含枚举 / 数值字段；SC1-B2 只定义 retainer 接口 + FakeRetainer；资源型字段与真实持有归 SC3-B1；同步 retainer 分期已由 3D-43 修正，SC1 须交真实同步持有 |
| 3D-37 | Medium | lvr-3d.md 未随 SD12 更新：R4 / R7 / §4 仍写 `resources/kits/lvr/3d/**`，与 3D-ASSETS §13「`resources` 只许 `data/`」矛盾；未提 HUD 走 overlay | lvr-3d.md v1.2：落点改 `bundles/kit-lvr[-<map>]/3d/`，小数据 `resources/kits/lvr/3d/data/`；R1 / §4 加 HUD 走 overlay |
| 3D-38 | Low | 「glb 禁内嵌图片 + 外部 `images[].uri`」的 Creator 3.8.8 导入行为无仓内证据 | SC0-B2 加显式验证；失败退路 `.gltf + .bin` 或允许内嵌并改 3D-ASSETS §3 |
| 3D-39 | Low | `overlay` 复用 `interactive:true`，与 CLIENT.md §4「interactive = 模态所有权」语义打架 | `inputMode` 改三态 `modal / overlay / passive`，`interactive` 降为兼容别名；SC1-B9 与 CLIENT.md 回写同步 |
| 3D-40 | Low | SC1-B7「单段命名规则」无正则；索引版本未随 v1.2 更新 | 钉 `^[a-z][A-Za-z0-9]*$`、`<class>` ∈ {kit, plugin}；CLAUDE.md / AGENTS.md 索引改 v1.3 |

### 1.5 第五轮审阅（2026-09-22，对当前 v1.3 计划与仓内实现）——3D-41–3D-45、3D-47

以下为 **v1.4 文档修订** 采纳、经 **v1.5** 范围精简后保留的六项；§8 不勾选任何实施批次。§1.1–§1.4 保留历史原文，与本节冲突的旧处置以本节及修订后的施工批次为准。

| 编号 | 严重度 | 问题 | 修订与验收落点 |
| --- | --- | --- | --- |
| 3D-41 | High | `dispatchInput` 收到的是已去掉 pointer 身份的业务意图；Snake 在调用前已登记 router owner、移动摇杆或切 boost，后置闸不能阻止 HUD 触摸污染世界输入 | SC0-B3 允许固定夹具的最小完整 pointer 状态机；SC1-B9 在玩法 router 前提供框架 raw-input 端口、迁移现有 presentation 订阅、绑定 owner 与取消回调；双指 HUD / 世界并行及按住 boost 开模态验证 |
| 3D-42 | High | 同模型 / 同材质不保证预烘焙蒙皮可合批；不同 clip / 图集可能绑定不同 jointTexture，实时蒙皮也不能沿用预烘焙 instancing 材质 | SC0-B2/B3 与 SC4-B1 记录 Joint Texture Layout 或按实际 jointTexture 分批策略；多 clip / 跨图集验证，实时路径关闭 instancing |
| 3D-43 | Medium | SC1-B4 依赖真实同步 retainer，SC1-B2 却只交接口 / FakeRetainer，阶段无法完成真实资源回收验收 | SC1-B2 交真实同步 loaded-asset retainer 与 fake；SC1-B4 临时 loader 只消费此边界，SC3-B1 才加入异步批量加载 / deadline / 取消 |
| 3D-44 | High | GLB 图片 URI 检查不能证明 Prefab / Material / 动画图等序列化 UUID 引用及子资产引用闭合，包干净安装后可丢资源 | SC1-B5 建顶层 / subMeta UUID 索引并检查序列化引用闭合、同包边界与显式内置资源例外；SC1-B7 pack/install 干净根复验，悬空 / 跨包 / 子资产反例 |
| 3D-45 | Medium | `root.frameTime` 是引擎 dt，不能代替未经平滑 / 钳制的实际帧间隔；`frameCount` 会重置，不能作为单调采样标识 | SC0-B3 / SC3-B5 在真实帧回调采 `performance.now()` 相邻差值（ms），独立序号；保留原始样本，dt 只作辅助；长帧及 frameCount 重置反例 |
| 3D-47 | Medium | 远程 bundle 首次下载与真实微信客户端缓存回收未被验收覆盖 | SC4-B3 在真实微信设备做冷缓存 / 满缓存 / LRU 淘汰 / 重启再进入；记录平台 / 微信版本 / 存储状态 / 请求与缓存命中 / 失败恢复；lvr A3 同步 |

同时更新消费方时间线：mmo kit v1 已冻结，后续 3D 接入为可选增量；`MmoWorldView` 沿 `mount / unmount` 经 `GameplayServicesContext.stage3d` 取同一舞台服务，不套页面 `onOpen / AppPorts` 入口，不追改 MMO 已完成记录或批次。

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
| SC0-B1 引擎面清单 | 打开 `apps/Cocos`：把 `engine.json` 改为显式模块清单（SD11：`custom-pipeline` + `custom-pipeline-builtin-scripts` + `custom-pipeline-post-process` ON、`legacy-pipeline` OFF；关 terrain / tiled-map / dragon-bones / xr / physics / particle-2d 等），确认当前管线（CDP 读 `cc.director.root.pipeline` 构造名）、`project.json` 声明两个保留层位、登记 `wechatgame.json` 的平台扩展版本；Spine 切 4.2 并核对存量用法；既有登录页 3.8.99 装饰动画按 2026-09-22 用户确认改为原姿态静态展示，保留作者归档并重新发布 FGUI；`apps/Cocos/README.md` 记录引擎 / 相机与隔离预览步骤 | README 段落存在；内置管线 / 层位 / Spine 配置与真实预览证据齐全；`verify:inventory` 绿（AGENTS / CLAUDE 不变） | 人工 Creator；文档提交 |
| SC0-B2 灰盒资产生成器 | `tools/art3d/greybox.py`（pygltflib + numpy，venv 照 `tools/slg-maps/README.md`）：`greybox-cube.glb`（静态）、`greybox-plane.glb`（地面 64×64、带 UV2）、`greybox-biped.glb`（两骨 skin + 至少两段可区分的 1 s 动画，另有能触发不同关节纹理图集的受控样本，供 B3 / SC4-B1 验同图集与跨图集）；各 GLB 的 scene 名固定为主文件名；输出到 `apps/Cocos/assets/resources/stage3d/`，不嵌入图片（cube 带一张 64² 外部 PNG 以**验证 Creator 3.8.8 对外部 `images[].uri` 的 `.glb` 导入**：texture 子 meta 生成、路径解析；失败退路 `.gltf + .bin` 或允许内嵌并改 3D-ASSETS §3，3D-38）；Creator 导入生成 `.meta`（`importer: "gltf"`）并记录 `gltf-scene` 子资源路径，例如 `stage3d/greybox-biped/greybox-biped`，写入夹具资源清单；若实际导入命名不同，以导入结果修正清单，⛔ 用 GLB 父路径代替 Prefab 子路径 | GLB 结构与 `.meta` 存在、子路径可加载为 Prefab；`verify:sync` 绿（uuid 唯一）；`python3 tools/art3d/greybox.py --check` 重生成字节一致；框架 `greybox-*` 命名例外写入框架资产配置 | `python3 tools/art3d/greybox.py --out apps/Cocos/assets/resources/stage3d` |
| SC0-B3 CDP 探针实测 | `tools/creator-preview/probe-stage3d.mjs` 驱动隔离 spike 分支中的真实 `CocosView` 地图页、非模态 FGUI HUD 与模态弹窗（sidecar + builtin route + `codegen:plugins`；允许最小输入适配与类型桩，正式化见 SC1-B1/B9，⛔ 仅裸建 Node 判输入 PASS）；**原型范围**：允许固定夹具所需的最小完整 pointer 归属状态机、raw-input 分流与取消桥，放在玩法 router 之前，⛔ 提前泛化全部页面 / 元数据；**时间盒候选 3 人日**，超出即停并记 3d.md §8；第二载体用既有 snake 局迁到该原型，验证 HUD 点击、世界拖拽、跨边界、wheel、双指分别操作 HUD / 世界、按住 boost 打开模态后的取消与恢复。相机 / 灯运行时创建；按 B2 清单加载 biped ×100 + cube ×500 + ParticleSystem ×1：预烘焙 instancing 按实际 jointTexture 分组，验证 Joint Texture Layout 能否统一所需 clip，否则保持分批；至少两 clip 同播及切 clip 跨图集无错动画；验证浮点 / RGBA8 关节纹理路径，不能因缺浮点纹理直接判烘焙不可用，实时蒙皮关闭 instancing。真实帧回调以 `performance.now()` 相邻差值记录 240 帧原始间隔 ms（60 帧 warmup），自有递增序号；`root.frameTime` 仅辅助 dt，⛔ 以会重置的 `frameCount` 作采样标识；同时在帧末读 device 计数器，加载 / 首次激活峰值另采、不被 warmup 抹掉（3d.md §7）。预热至引擎缓存稳定后开关 20 次，业务引用归零、GFX 无持续增长；WebGL2 / `--disable-webgl2` 各跑一遍 | 接缝逐项 PASS / FAIL；JSON 落 `docs/perf/stage3d/<date>-spike{,-webgl1}.json`，含原始帧间隔 ms / p95、jointTexture 分组与 clip 证据、退化行为、开关节点 / 引用 / GFX 内存基线；内置管线两上下文可渲；HUD pointer 不进入世界 router，模态关闭不恢复旧 boost / 拖拽；最小桩与原型移交 SC1 | `node tools/creator-preview/probe-stage3d.mjs`（前置同 creator-preview README） |
| SC0-B5 烘焙与预制加载（← B1/B2，先于 B4） | 在临时验收场景摆灰盒地面 / 立方体与静态光，LightFX 烘一次 lightmap 并 apply 到 `resources/stage3d/P_Stage3d_Baked.prefab`；烘焙产物及 meta 随预制资产入库；记录操作步骤与 UUID 依赖，关闭验收场景、清掉编辑器场景状态后，在主预览页仅按独立 Prefab 路径加载（⛔ 借用验收场景的 lightmap 数组 / 节点） | 原场景与独立动态加载对照截图一致、无丢贴图 / UUID，WebGL2 / WebGL1 可渲；开关后业务引用归零、GFX 按 3d.md §7 预热基线无持续增长；缺任一烘焙依赖必须可定位失败；不能 apply / 重载则 SC0 不退出，先修订规范 | Creator 人工烘焙 + `probe-stage3d.mjs` 烘焙预制场景 |
| SC0-B4 冻结与回填（← B1/B2/B3/B5） | 3d.md §9.2 与 3D-ASSETS.md §15.1 素材数字由候选经实测后冻结；回填 WebGL1 退化、内置管线在 WebGL2 / WebGL1 预览中的可用性、raw-input 接缝、蒙皮分组与 B5 烘焙重载结果；不可用则修订设计并记录新拍板项，不带失败进入 SC1；3d.md §10 登记 SC0 | 预算表已区分冻结政策与实测负载，后续容量验收仍按原阶段执行；全部接缝及烘焙重载 PASS；记录原型移交 / 移除清单 | 文档提交 |

退出：B1/B2/B3/B5 完成后做 B4（B0 已完成）；tag `sc0-exit`。回滚：隔离 spike 中的临时页面 / 输入适配 / 桩按清单移除或移交 SC1；探针、灰盒与证据可保留；不得把原型记作正式能力。

### SC1 · Stage3D + 类型桩 + 端口 + 夹具页 + 资产闸（波 1，← SC0）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC1-B1 类型桩 3D 面 | `apps/client/cc-stub.d.ts` 与 `client-test-stubs.d.ts` 各补：`Camera`（`ProjectionType` / `ClearFlag` / `rect` / `priority` / `visibility` / `fov` / `screenPointToRay`）、`DirectionalLight`、`Layers.Enum`、`Quat`、`Prefab` / `instantiate`、`resources` / `AssetManager.Bundle`、`SkeletalAnimation`（`useBakedAnimation`）、`SkinnedMeshRenderer` / `SkinnedMeshBatchRenderer`、`ParticleSystem`、`LODGroup`、`Billboard`、`geometry.Ray` / `AABB`、`SceneGlobals` 子项（`skybox / fog / shadows / postSettings / ambient`）、`Tween`；只声明 SC1–SC4 会用到的成员（桩文件头注释既有约定） | `npm run typecheck` 两探针绿；桩变异：删 `Camera` 声明 → SC1-B2 编译红（记进提交信息） | `npm run typecheck` |
| SC1-B2 `Stage3D` 核心与同步引用边界 | `view/scene3d/stage3dLayers.ts` 与 `Stage3D.ts`：引擎适配器、单舞台租约、相机 / 灯 / 视口 / 射线接口；舞台与独立全局租约共用 token 覆盖表，首 token 记录基线，按取得顺序重算有效 patch，更新不抢优先级、释放不复活旧快照，owner 关闭自动清理。SC1 的 `Stage3DGlobalsPatch` 仍只含枚举 / 数值字段；`view/scene3d/AssetLease.ts` 本批交内部 loaded-asset retainer 的接口、**真实同步 addRef / decRef 实现**与 FakeRetainer（3D-43），作为夹具与后续全局资源的唯一持有边界；只接已加载资源，异步批量加载 / deadline / 取消留 SC3-B1，不增 kit 公开 retain API。owner = `Stage3DOwner { signal; isActive() }`；`logic/scene3d/viewport.ts` 做设计矩形换算 | FakeNode：单舞台忙拒、自动 / 重复释放；全局 token 正反乱序释放、字段覆盖 / 合并 / 撤回、更新不抢优先级、失败回滚及最终回基线。retainer 真适配器配 FakeAsset 验成对持有、资源不提前释放、重复 release 幂等；B4 真引擎验证引用回收。变异：release 写回旧快照或删真实 decRef → 对应用例红 | `npm run test:client` |
| SC1-B3 端口接线 + 引擎适配器 + 保护面 | `app/ports.ts` `AppPorts.stage3d: Stage3DPort`；`app/bootstrap.ts` 创建 `Stage3D(new CocosStage3DEngine())`（`view/scene3d/cocosStage3DEngine.ts`：真 `Node` / `Camera` / `DirectionalLight` / `director.getScene().globals`，相机与根挂场景根、priority 0、`scene.scene` 零改动）并注入 `AppPorts`；`gameplay/services.ts` 的 `GameplayServicesContext.stage3d` 暴露**同一实例**（gameplay 世界的第二入口，3D-34；services.ts 已在 gameplayFlow 保护面）；`apps/client/test/appHostHarness.ts` 提供 fake `stage3d`；**MF9-B2 前置已满足**：`scripts/protected-paths.json` gameplayFlow 加 `apps/client/src/view/scene3d/Stage3D.ts`、`stage3dLayers.ts` + `node scripts/protected-paths-lock.mjs --write` + Non-intrusive §12.2 散文一句 | `appRuntime.test.ts` 加「ports.stage3d 可达且 dispose 时释放在途租约」；`gameplayModule.test.ts` 加「services.stage3d 与 ports.stage3d 同一实例」；`protectedPaths.test.ts` / `protectedPathsLock.test.ts` 绿；变异：bootstrap 不注入 → appRuntime 用例红 | `npm run test:client`；`npm run verify:protected-paths` |
| SC1-B8 画质、预设与验收场景（← B1/B3） | `view/scene3d/quality.ts` 读平台 / GPU / 能力，`logic/scene3d/qualityTiers.ts` 纯函数返回 low / medium / high 与特性开关；未知移动 GPU / WebGL1 / 微信归 low，dev URL 覆写不得虚构硬件能力；`ports.stage3d.quality` 接线；定义并校验 `quality/pool/detail-layers` 数据表形状，示例在框架资源目录；builder.json 登记 `3d-default/3d-alpha` 平台压缩预设及 PNG 回落；创建不入构建的 `stage3d-dev.scene`，复用 SC0-B5 烘焙工作流 | qualityTiers 测平台 / GPU / 未知 / dev 覆写、production 拒覆写、特性能力钳制；低档阈值为 SC0 冻结表；预设引用能解析、无 ASTC 时选 PNG；验收场景可独立加载预制且构建列表排除；两套 typecheck 绿 | `npm run test:client`；`npm run typecheck`；Creator 预设与场景验证 |
| SC1-B9 非模态 HUD 与 raw-input 接缝（← SC0-B3） | `view/defineView.ts` 新增 `inputMode?: "modal" \| "overlay" \| "passive"`，保留 `interactive` 别名且拒矛盾 / 非 FGUI overlay；sidecar schema / `apps/server/tools/plugin-codegen/` 同步。`ViewMgr.ts` / `FguiView.ts` / `CocosView.ts` 与框架 `view/input/` 适配器负责命中、按起点锁定 pointer owner、wheel 分流与模态边界。`gameplay/services.ts` 的 presentation host 增 owner 绑定的 **raw-input 订阅 / 取消端口**，`app/AppRuntime.ts` 接入同一适配器；迁移 `view/rooms/**` 现有 presentation 的全局触摸订阅及 `gameplay/modes/**` 装配（snake 必验），先路由 raw pointer 再进入玩法 router。`GameplayInstanceHost.dispatchInput` 继续守业务意图世代 / hide，⛔ 仅在此处补无 pointer 身份的过滤冒充归属。关闭 / 重挂 / 模态抢占先调用 owner 取消回调清掉 router / joystick / boost，再拒后续旧事件；取消需要的 release 意图须能完成，不被后置业务闸吞掉；⛔ 改 vendor | 既有默认仲裁测试零改动绿；snake + overlay：HUD 点击不进入世界 router、双指分别操作 HUD / 世界互不影响、世界指针跨 HUD 完成原拖拽、wheel 命中分流；按住 boost 打开模态立即释放并清空 owner，关闭不补 click / 恢复 boost / 续接拖拽；root 重建清理；非法 sidecar 拒绝；WebGL2 / WebGL1 真引擎证据。变异：把 raw 闸移至 dispatchInput 或删除 cancel → 对应用例红；同步文档与受保护路径锁 | `codegen:plugins`；`npm run sync:client`；`npm run test:client`；`npm run verify:protected-paths` |
| SC1-B4 夹具页 `stage3dFixture`（← B8/B9） | `Stage3dFixtureView.ts`（CocosView，`interactive:false`、base、fullscreen）+ sidecar + `logic/page/Stage3dFixtureLogic.ts`；经 `ports.stage3d.acquire` 取舞台，按 SC0-B2 清单加载 plane / cube 的 Prefab 子资源（SC3 前临时框架 loader 使用 B2 的真实同步 retainer 统一引用（异步回调成功即取得持有，失败 / 页面已关闭时也经同一边界归还），SC3 换完整 AssetLease）；引用 B8 验收场景产出的独立烘焙预制；header / footer HUD 用 B9 overlay FGUI 夹具，弹窗用默认 modal；登记 builtin routes / sidecar、生成注册表；关闭先撤场景引用再释放资产；`tools/creator-preview` 的 stage3d 剧本覆盖输入与开关 | 无头与真实页面均验 HUD 点击 / 空白拖拽 / 指针跨 HUD / 模态阻断恢复；20 次节点与引用回基线；WebGL2 / WebGL1 截图、console 与预热后 GFX 稳定证据（3d.md §7）；load 失败 / 页面提前关闭能回收。变异：overlay 参与 modal top 选择 → 地图输入用例红 | `codegen:plugins`；`npm run sync:client`；`npm run test:client`；`node tools/creator-preview/run.mjs stage3d` |
| SC1-B7 bundle 目录与所有权（框架 PR，SD12） | `apps/Cocos/assets/bundles/<class>-<id>[-<map>]/` 推导精确目录：根名等于 `<class>-<id>`，或以 `<class>-<id>-` 开头且地图后缀非空并匹配 `^[a-z][A-Za-z0-9]*$`；`<class>` ∈ {kit, plugin}，包 id 不含连字符；根 `.meta` 随归属，子树不得跨包。`apps/server/tools/plugin/{ownership,pack,install,uninstall,lock,check,changed}.ts` 全链覆盖；builder.json 平台覆写（小游戏 remote、native/web 缺省本地）；AssetLease 寻址固定 bundle 名 + 路径；KIT/PLUGIN 落点表回写。包工具侧同批交可复用的 UUID / 子资产引用解析与归属检查核心，在 pack / install 落盘前调用（B5 复用此核心，不循环等待 B5 命令）；包机制测试增加合成包 pack → 无开发树 / Library 缓存的临时干净根 install → 重新建立 UUID 索引并验证引用闭合，Creator 重导入 / 加载 Prefab → Material → Texture / 模型子资产链作为退出证据（3D-44） | foo / foobar 互不认所有权、伪装写 foobar 拒绝、卸载 foo 保留 foobar、changed 不混所有者；根 meta 同规。干净安装保留 Prefab / Material / 动画图及子资产依赖，悬空 UUID / 缺 subMeta / 跨包引用失败，版本固定的引擎内置白名单正例通过；卸载无关包不破坏引用链；去掉边界 / 引用检查各使对应反例红 | `npm --workspace @game/server run plugin -- check`；`npm run verify:all`；干净安装 + Creator 重导入证据 |
| SC1-B5 `verify:assets3d` + 登记（← B7 所有权 / B8 压缩预设） | `scripts/verify-assets3d.mjs` 扫 `resources/stage3d/**`、`resources/{kits,plugins}/*/3d/**` 与 `bundles/*/**`，完整消费 3D-ASSETS.md §13：格式 / importer / subMeta、GLB 结构与图片 URI、贴图 / 压缩、模型导入选项 / 命名 / 预算 / 授权覆盖。复用 B7 包工具侧的序列化引用检查核心：索引实际 Creator 顶层及 subMeta UUID，按引擎格式规范化压缩 UUID 与子资产标识；递归解析 `.prefab/.mtl/.anim/.animgraph/.animask` 与模型 `.meta/subMetas` 等的外部 `__uuid__` 引用（区别 `__id__` 内部对象索引），同包细分 bundle 与小数据必须闭合，框架夹具同其命名空间。允许同包及框架维护的精确资源 / 子资产 allowlist，内置资源在此单列并钉 3.8.8 来源和可解析性；其余悬空、跨包、未登记宿主及缺子资产均拒绝，`requires.kits` 不授权 kit 内部 UUID 引用，⛔ 任何未找到的 UUID 都当内置。配置在 `scripts/assets3d.config.json`；测试 + package.json verify:core + CLAUDE/AGENTS 命令表 + inventory 同批；同一核心同时守母仓检查与 B7 干净安装 | 合规 `.mtl/.hdr/.animgraph/.animask`、本包多 bundle 引用与引擎内置白名单正例通过；改扩展 / 删 meta / 关 mip / 缺预设 / 错导入项 / 无授权 / 超预算 / 内嵌图片 / URI 越界各自红；Prefab 指向别包 Material（含声明 requires.kits）、引用未登记宿主资产、Material 丢 Texture UUID、删除模型 subMeta、压缩 UUID 指向不存在资产各自红；不扩白名单绕检查；`verify:inventory` / `verify:all` 绿 | `npm run verify:assets3d`；`npm run verify:inventory`；`npm run verify:all` |
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
| SC3-B1 `AssetLease` | `apps/client/src/view/scene3d/AssetLease.ts`：复用 SC1-B2 的真实同步 retainer，只在本批加入异步批量加载；注入 `AssetLoader { load(bundle, path, type, cb), addRef(asset), decRef(asset) }`（生产 = 按「bundle 名 + 路径」：`assetManager.loadBundle` + `bundle.load`，`resources` 只是名为 `resources` 的 bundle；SD12）；`acquire(requests[], { deadlineMs = 15_000, signal }) → Promise<{ assets, release }>`：一路一租约、addRef 于成功回调、失败 / 超时 / 取消整包 release、迟到完成仍 decRef、release 幂等；错误码 `ASSET_MISSING / ASSET_TIMEOUT / ASSET_CANCELLED`（`view/packageLoader.ts` 三态先例） | `assetLease.test.ts`（`slg-art-resources.test.ts` 的 FakeAsset 形态）：成功 / 部分失败整包释放 / 超时 / 取消 / 迟到完成 decRef / 二次 release 无副作用；变异：失败分支不 release → 「迟到完成引用泄漏」红 | `npm run test:client` |
| SC3-B2 `assetPlan` | `logic/scene3d/assetPlan.ts`：`(quality, lod, visibleChunks, catalog) → { acquire[], release[] }` 差分，先按 `quality.json` / `detail-layers.json` 剔除禁用细节层，再按 LOD 选变体；出档延迟释放（graceMs 注入时钟），页面关闭立即清理 | 差分 / 滞回 / 时钟测试；low 的 acquire 集不含 details，切档产生正确差分；变异：删除画质过滤或延迟释放 → 对应用例红 | `npm run test:client` |
| SC3-B3 `EntityPool` | `view/scene3d/EntityPool.ts`：按 prefab 键的 Node 池，近主文件 / 远离线简模或 Billboard、hideAtLod、共享材质 instancing；消费 SC1-B8 quality、pool / detail-layers 数据；大批 spawn 入队，激活预算按档每帧最多 N 个，despawn / 切 LOD / 页面关闭取消过时代次队列，inactive 池节点仍持有资产直至淘汰销毁；细节层与 SC3-B2 加载计划一致 | FakeNode：复用 / 上限 / LOD / hideAtLod、500 次 spawn 不突破逐帧 N、关闭后无迟到激活、低档 details 不加载也不激活、淘汰后释放引用；夹具 500 灰盒开关 + SC3-B5 各画质性能证据。变异：直接同步激活全部 → 预算测试红 | `npm run test:client` |
| SC3-B4 slg 迁移消费与全局引用接线 | `kits/slg/view/SlgArtResources.ts` 改为 AssetLease 包装（公开 API 不变）；两个 Renderer 的 toneMapping 直改经 SlgMapView 注入，使用 `ports.stage3d.acquireGlobals(owner, { toneMapping: "linear" })`；SC1 全局资源持有接口接入完整 AssetLease（含补丁被覆盖期间的持有，先移除场景引用再释放资产），删除夹具临时框架 loader | slg 既有资源测试零改动绿；两 Renderer 正反顺序释放、与舞台交错关闭均保留有效值并最终回基线；全局资源替换 / 失败 / 页面关闭测试；`rg "director.getScene" apps/client/src/kits/slg` 无匹配 | `npm run test:client` |
| SC3-B5 `creator-preview --perf` | `tools/creator-preview/perf.mjs` 正式化 SC0 探针：真实引擎帧回调按 `performance.now()` 相邻差值采 240 帧原始间隔 **ms**（60 帧 warmup），独立递增 sample index，保留原始样本；`director.root.frameTime × 1000` 仅另列引擎 dt 毫秒，`root.frameCount` 不作单调帧 id。每帧末同时读 device `numDrawCalls / numTris / numInstances`，结束读 `memoryStatus.{bufferSize,textureSize}`；加载 / 首次激活另采原始序列与峰值，长于 1 s 的帧不截断；前后台切换污染样本标记无效后重跑，不静默删长帧；内存按 3d.md §7 预热后稳定基线验证；`run.mjs --perf` 写 `report.json.perf` 与 `docs/perf/stage3d/<date>-<scenario>.json`。聚合 p50 / p95 / max、单位与 JSON 形状测试进 `apps/server/test/creator-preview-tool.test.ts` | 人为 1.2 s 长帧记录为 1200 ms，不被引擎 dt 钳制 / 平滑为约 16.7 ms；frameCount 重置时仍连续采足目标样本；秒 / 毫秒混用反例红。Creator `stage3d --perf` 的 WebGL2 / WebGL1 各一份（500 立方体：原始帧间隔 ms / p95、draw call、三角数；标注设备 / 画质 / WebGL 版本）；⛔ 仅有辅助 dt 的报告判 PASS | `node tools/creator-preview/run.mjs stage3d --perf` |
| SC3-B6 文档 + 退出 | `docs/CLIENT.md` §8 加「3D 性能证据」小节（`--perf` 用法、⛔ 不进自动聚合门禁）；3d.md §10 登记 SC3；slg.md §10.8 / lvr-3d.md §8 通知 | — | 文档提交；tag `sc3-exit` |

退出：B1–B6；tag `sc3-exit`。回滚：可回退（slg 包装保留原签名）。

### SC4 · 蒙皮与特效（波 3，← SC2 + SC3）

| 批次 | 内容 | 机检退出 | 命令 |
| --- | --- | --- | --- |
| SC4-B1 `SkinnedUnits` | `view/scene3d/SkinnedUnits.ts` 以 EntityPool 为底，预烘焙路径用 `SkeletalAnimation.useBakedAnimation=true` + SkinnedMeshRenderer；合批键至少包含 mesh / material / **实际 jointTexture 与兼容实例布局**，不能只看 prefab。使用 SC0 验证的 Joint Texture Layout 将需同批的 clip 放入兼容图集，不能统一时按 jointTexture 分批；`play(entity, clip)` 切换跨图集须重分组，`socket(entity, name)` 保持挂点。运行时混合 / WebGL1 退化的实时路径显式 opt-in，并使用关闭 instancing 的材质路径，⛔ 污染共享的预烘焙材质 | `skinnedUnits.test.ts` 验烘焙开关、同纹理分组、跨纹理拆组 / clip 重分组、实时关闭 instancing、socket；真夹具 100 biped 至少两 clip 同播、含跨图集样本、浮点 / RGBA8 路径与实时样本，动画均正确且 draw call / instances 与分组相符。变异：省略 jointTexture 键或实时仍开 instancing → 对应用例红；WebGL2 p95 原始帧间隔证据 | `npm run test:client`；`node tools/creator-preview/run.mjs stage3d --perf` |
| SC4-B2 `Vfx` | `apps/client/src/view/scene3d/Vfx.ts`：`ParticleSystem` prefab 池；`play(key, at 或 follow)`；按 LOD 档禁用；定时销毁；同键并发上限；随租约 release 全部回收 | `vfx.test.ts`（池复用 / LOD 门 / 定时 / 上限 / 释放）；夹具页「50 特效」开关 + `--perf`；变异：删 LOD 门 → 「远档仍播」红 | `npm run test:client` |
| SC4-B3 WebGL1 / 真实微信设备退化与缓存（**门**，SD10） | Chrome `--disable-webgl2` 跑 `stage3d --perf`；low 退化实现并有用例：先验证预烘焙浮点 / RGBA8 关节纹理的实际采样能力，实际不可用或超预算才切关闭 instancing 的实时蒙皮上限 + 公告板远档；instancing 不可用 → 降低单位 / 绘制预算；ASTC 不可用 → PNG 回落。**退出须真实微信设备**运行同一构建，覆盖冷缓存首下载，随后在真实客户端实际触发缓存写入失败，再观察 LRU 淘汰 / 清理、重试、重新访问与退出重启再进入，记录设备 / 系统 / 微信版本 / 构建版本 / 基础库版本 / 资源版本 / 平台实际存储容量 / 限制 / 存储状态、可复现填满或触发失败步骤与真实错误、请求及缓存命中、可见资产与失败恢复；不假设引擎存在可配置容量开关，接近满但未触发失败不能通过；失败时不遗留半就绪舞台 / 引用，恢复后重试须成功。步骤与证据模板放 `tools/creator-preview/README.md`，摘要回写 3d.md §8 / §10 与 3D-ASSETS.md §11；lvr A3 等本批并提供内容侧同口径证据 | WebGL1 报告 + 真实微信冷缓存 / 写入失败 / LRU / 重试 / 重启证据及判定均齐全；退化 / 故障恢复用例绿。变异：删实时材质退化或缓存失败清理 → 对应用例红 | Creator + Chrome 标志；真实微信设备（退出） |
| SC4-B4 文档 + 退出 | 3d.md §10 登记 SC4；lvr-3d.md §8 通知「A3 可开工」，须附 SC4-B3 真实设备证据；mmo 如后续选择 3D，在消费方新增增量接入记录，⛔ 回头改写已退出的 MK 阶段或既有 MMO 批次 | — | 文档提交；tag `sc4-exit` |

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
| R0 平台目标（SD10） | — | lvr 为首发小游戏 / WebGL1 消费方：low 档必达，A1–A5 每阶段附 WebGL1 证据，A3 加真实微信设备冷缓存 / 实际写入失败 / LRU / 重试 / 重启证据（同 SC4-B3） | R0 登记（lvr-3d.md v1.5）；渠道 SDK / 发版打包 / 审核仍按 lvr.md §9.3 不做 |
| A0 可行性（并入 SC0） | SC0-B3 | 用 lvr 样本资产（1 建筑 + 1 单位动画 + 1 海面贴图，经 `tools/art3d` 骨架前身手工 glb）在 `probe-stage3d.mjs` 里跑第二份证据 | 样本资产授权台账起草 |
| A1 场景骨架 | SC1、SC2、SC3 | `ports.stage3d.acquire` + `cameraRig`（俯视角、手感常量进 `apps/shared/src/kits/lvr/api/…`）+ `lodBands`（阈值表 shared 单源）+ `AssetLease` | 海面 EffectAsset、静态地表内容、`art3d.config.json` |
| A2 实体层 | SC3 | `EntityPool` 两级档 + `chunkStreamer` + `assetPlan` | 19 种地图实体的 prefab / LOD 组 / `hideAtLod` 表 |
| A3 单位动画 | SC4 | `SkinnedUnits`（预烘焙 + instancing）；行军线用 `EntityPool` 简模 | 单位模型 / 动画重导出为 glb |
| A4 主城 | SC3、SC4 | `EntityPool` + `Vfx`；三档细节状态机是 kit logic（吃纯度门） | 建筑四态、特效挂点表 |
| A5 特效与表演 | SC4 | `Vfx` 池；Spine 4.2（Creator 原生） | 20–30 个高频特效重建、英雄立绘 |

lvr 侧验收：每阶段 `verify:all` + `test:client`（logic 无头覆盖相机数学 / LOD / 流式差分）+ `tools/creator-preview --perf` 证据落 `docs/evidence/creator-<date>/lvr-3d/`+ 每阶段一份 WebGL1 证据（SD10 首发消费方，lvr-3d.md R0）；状态只回写 lvr-3d.md §8。

### 4.2 `mmo` kit（SD9 = C，2026-09-19 拍板）

| 阶段 | 接法 | 与 MMO-PLAN 的交点 |
| --- | --- | --- |
| 既有 2D 基线与后续消费 | mmo kit v1 已冻结；当前世界表现与 HUD 以既有交付为准。本轨道后续提供 cameraRig / lodBands（SC2）及 FGUI overlay 的 raw-input 接缝（SC1-B9），接入时使用 WorldPresentation 适配器和 presentationId 映射；现有世界内 HUD 可继续沿用 | 不将本轨道重新设为已退出 MK0 / MK1 的前置，不追改 MMO 阶段完成记录；新增消费在后续接入记录中登记 |
| 可选 3D 增量（冻结基线之后评估） | `MmoWorldView` 的 `mount / unmount` 生命周期经 `GameplayServicesContext.stage3d` 取得 / 释放同一舞台租约；owner 用 route signal + GameplayInstanceHost generation。实体 = EntityPool + SkinnedUnits（presentationId 解析内容 model）；特效 = Vfx；相机 = cameraRig.follow(self)；⛔ 套页面 onOpen / AppPorts 入口 | 依据 SC3 / SC4 实测（含 WebGL1）另行决定；若接入，只新增消费方记录，不改已完成 MMO 批次（SC4-B4） |

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
| P5 | 性能计数器仍用 gfx.Device；原始帧间隔改为真实帧回调 `performance.now()` 差值 ms，root.frameTime 仅辅助、frameCount 不作单调序号（3D-45 替代 3D-18 的采样口径） | 3d.md §4 / §7；SC0-B3 / SC3-B5 |
| P6 | 灰盒资产由 `tools/art3d/greybox.py` 合成，框架夹具零外部素材（3D-19）；框架资产目录 `apps/Cocos/assets/resources/stage3d/`（3D-22） | 3d.md §4 / §5 / §6.2 |
| P7 | `AppPorts.stage3d` 是端口接缝（3D-13）；3D-34 起 `GameplayServicesContext.stage3d` 为同一实例的第二入口（部分修正） | 3d.md §3.3 |
| P8 | SD9 / SD10 已拍板；SC0-B4 只做实测冻结与回填（3D-21、SC4-B3） | ✅ 3d.md §9.1 |
| P9 | lvr-3d.md L01–L09 对齐为消费方需求 v1.1（SC0-B0） | ✅ eef7c1a2 |
| P10 | SD9–SD12 于 2026-09-19 拍板（C / 门 / 引擎内置新管线 / 每包一 bundle）：新增 SC1-B7 bundle 目录与所有权框架 PR；SC4-B3 改为门；SC0-B4 改为冻结与回填；SC0-B1 / B3、SC1-B4 / B5、SC3-B1 / B5 加 WebGL1 与 bundle 口径 | ✅ 3d.md §9.1、3D-ASSETS.md v1.1、本文 §0 / §1 / §3 / §4.2 / §7 / §8 |
| P11 | SD10 首发消费方 = `lvr`（2026-09-19 拍板）：lvr-3d.md v1.3 新增 R0 + §4 / §5 / §6 / §7 补 WebGL1 判据；lvr.md 前提表加「首发平台」行、§9.1 / §9.3 注记 | ✅ 3d.md §0 / §6.3 / §8 / §9.1、本文 §0 / §4.1 / §7 |

## 7. 风险与看护点

- **SC0 是真门**：任一接缝判据 FAIL（尤其「UI 相机与 3D 相机叠加」「HUD 输入不被吞」）就回头改 3d.md，⛔ 不带病进 SC1。
- **两轨道并行**：框架实现按本表文件落点推进；SC1-B9 显式授权输入 / sidecar / codegen 接缝改造，SC1-B7 是包所有权改造，SC1-B8 是画质 / settings / 验收场景；不得以旧的「只改 app 一个字段」约束漏掉这些批次。MF9 已退出，后续仍须检查其他轨道对同一保护面 / 锁的变更，B3/B9 各自按实际 diff 重钉。
- **slg 零改动闸**：SC2-B2 / B3 / SC3-B4 都以「slg 既有测试零改动全绿」为退出条件；一旦要改 slg 测试断言，说明抽取改了语义，回退重做。
- **桩漂移**：类型桩只补用到的成员；Creator 侧真类型仍由预览把关（桩文件头注释既有约定）。
- **显存与机型**：桌面数字不等于手机；`--perf` 标注设备、画质、WebGL 版本并保留原始帧间隔 ms；每阶段 WebGL1 证据仍是退出条件。SC4-B3 另需真实微信设备的冷缓存 / 实际写入失败 / LRU / 重试 / 重启证据；lvr A3 同口径。
- **资产体积**：`verify:assets3d` 上限在 SC0-B4 冻结后不得静默放大；改数 = 新拍板 + 3d.md §10 登记。
- **Spine 版本切换**：工程级单选，切 4.2 后任何后续 3.8 导出都要重导；登录页实际经 FGUI loader3D 使用 3.8.99 素材，不能以没有 TypeScript 直接调用认定零用法。2026-09-22 用户确认改为静态展示；原作者资源归档、静态姿态从原运行时导出，SC0-B1 在 4.2 环境重验登录页。

## 8. 批次状态（只在本文回写；阶段级完成回写 3d.md §10）

- [x] SC0-B0（eef7c1a2，随 Cyberpunk 校正完成） [x] SC0-B1 [x] SC0-B2 [x] SC0-B3 [x] SC0-B5 [x] SC0-B4
- [x] SC1-B1 [x] SC1-B2 [x] SC1-B3 [x] SC1-B8 [x] SC1-B9 [ ] SC1-B4 [ ] SC1-B7 [ ] SC1-B5 [ ] SC1-B6
- [ ] SC2-B1 [ ] SC2-B2 [ ] SC2-B3 [ ] SC2-B4 [ ] SC2-B5
- [ ] SC3-B1 [ ] SC3-B2 [ ] SC3-B3 [ ] SC3-B4 [ ] SC3-B5 [ ] SC3-B6
- [ ] SC4-B1 [ ] SC4-B2 [ ] SC4-B3 [ ] SC4-B4
- [ ] SC5-B1 [ ] SC5-B2
- 消费方：[ ] lvr A0（随 SC0-B3） [ ] lvr A1 [ ] lvr A2 [ ] lvr A3 [ ] lvr A4 [ ] lvr A5 ｜ [ ] mmo（按 SD9） ｜ [ ] slg 消费（随 SC2 / SC3）

- 2026-09-23 SC1-B9 完成：`inputMode:modal/overlay/passive` 与 `interactive` 兼容校验、owner 绑定 raw-input 端口、FGUI 命中适配及宿主全局后备输入已交付；Snake / BallMove 在玩法 router 前接入同一分流，模态 / hide / 关闭 / 重挂先取消摇杆与 boost，再关闭业务输入。旧输入原型已迁移删除，未改 vendor；默认仲裁测试原文未改。Creator 3.8.8 的 WebGL2 / 实际 WebGL1：夹具各 11 步（含根重建与 wheel）、真实 Snake 各 10 步，共 138 条 trusted DOM 触摸，全部通过。删除模态 cancel 的变异使 5 / 20 条输入测试转红并已恢复；真实引擎声明编译零诊断，本批 `verify:all` 全绿（客户端 956 / UniFlex 契约 63 / 服务端 1344 项，含两套客户端类型检查）。为完成真实 Confirm 验收，修复了页面私有字体被其它页面选作默认字体的问题；Snake 升至 1.2.5，MMO 测试夹具适配后升至 0.1.31，安装锁与保护锁同步。详见[验收摘要](perf/stage3d/2026-09-23-sc1-b9.json)。下一批 B4；本批只验输入接缝，未代替正式舞台的 20 次资源 / GFX 生命周期验收，SC1 未退出。

- 2026-09-22 SC1-B8 完成：按平台、GPU 与真实 GFX 能力提供 `ports.stage3d.quality`，未知设备 / WebGL1 / 微信默认 low；开发参数只改请求档位，生产忽略覆写，ASTC、关节纹理、instancing 与阴影仍受能力限制。quality / pool / detail-layers JSON 契约及同步默认值生成已落地；冻结预算保持不变，缺 instancing / 可用关节纹理时单位上限保守降为 25 / 50 / 50，池激活示例为每帧 4 / 8 / 16（执行和容量验收留 SC3/SC4）。两套压缩预设、PNG 回落、mipmap 与独立 `stage3d-dev.scene` 已由 Creator 3.8.8 验证；沿用 SC0 独立烘焙 Prefab，不读取作者场景状态。WebGL2 / 实际 WebGL1 各 7 项功能检查通过，ASTC 故障注入下真实 ImageAsset 选择 PNG；两个开发场景由全平台构建钩子排除，已在 Creator 内验证过滤结果，未宣称完整平台构建。新增 51 项测试、两次变异、真实引擎声明编译、两套客户端类型检查及本批 `verify:all` 全过（客户端 939 / UniFlex 契约 63 / 服务端 1341 项）。[验收摘要](perf/stage3d/2026-09-22-sc1-b8.json) 记录证据与哈希。下一批 B9；SC1 未退出，完整页面生命周期、资产闸与真机缓存仍按 B4/B5/SC4 验收。

- 2026-09-22 SC1-B3 完成：生产 Cocos 适配器、bootstrap 唯一实例与 AppPorts / GameplayServicesContext 两个 stage3d 入口已接线；宿主 dispose 兜底释放独立全局与舞台租约，启动失败清理含订阅原子回滚与旧宿主身份保护。适配器绑定捕获场景、严格有效性检查、真实屏幕视口换算与同帧矩阵更新；垂直相机 / 灯光使用备用 up，全局字段按启停顺序和实际变化写入，部分 setter 失败及回滚失败后强制重放并刷新管线。110 项定向测试、漏注入变异、真实引擎声明编译（0 诊断）及原工程 Creator 3.8.8 的 WebGL2 空舞台 15 项检查通过；两套客户端类型检查与本批 `verify:all` 全过（客户端 888 / UniFlex 契约 63 / 服务端 1341 项）。MMO 测试夹具适配必填端口，按包规则升至 0.1.30 并由 from-tree 工具重锁，API 面和冻结标签不变；原工程依赖通过 `npm ci` 恢复到锁定版本。按用户要求通过 Dashboard 面板打开原工程，证据与哈希索引留本地 `.cache/stage3d/sc1-b3/`。下一批为 B8；资产 / GPU 退休及 WebGL1 阶段证据仍归 B4，SC1 未退出。

- 2026-09-22 SC1-B2 完成：新增 Stage3D 协调器、场景作用域适配接口、统一全局 token 覆盖表与层掩码常量；同步 AssetRetainer 成对调用真实 addRef/decRef，viewport 纯数学保持 Cocos 左下原点与实际屏幕像素。61 项定向测试覆盖单舞台、三 token 全排列释放、字段撤回、owner/场景失效、取消回调重入、失败回滚与双故障恢复；无头预热后连续开关 20 次，节点与监听回基线。写回旧快照、删除 decRef、分别删除两套桩的 Camera 声明共 4 次变异均检出并恢复，补齐 B1 对正式 Stage3D 代码的 Camera 变异要求。两套客户端类型检查与本批 `verify:all` 全过（客户端 861 / 服务端 1341 项）；5 个脚本由隔离 Creator 3.8.8 导入并生成 meta，最终源文件针对真实引擎声明编译为 0 诊断。上游两份代理指南不一致已在独立提交修复；本批证据及哈希索引留本地 `.cache/stage3d/sc1-b2/`。生产 Cocos 适配器、双端口接线和保护面留 B3，真实舞台生命周期与 WebGL1 验收留 B4；SC1 未退出。

- 2026-09-22 SC1-B1：对照本机 Creator 3.8.8 声明补齐两套 3D 类型桩，校正 Asset 继承、相机射线参数、只读属性与构造签名。双配置类型消费探针覆盖合法用法和误用拒绝，同一消费片段针对真实引擎声明编译为 0 诊断；两套客户端类型检查、10 项定向测试（2 项类型契约 + 8 项既有蒙皮回归）及本批 `verify:all` 通过（客户端 802 / 服务端 1339 项全绿）。分别删除两份桩的 Camera 声明，现有 Stage3dFixtureView 均编译失败；删除两份桩的 screenPointToRay，双配置类型契约均失败，三次变异全部检出并恢复。SC1-B2 尚未实施，其正式舞台代码的 Camera 变异随 B2 重验。原始日志与哈希索引留本地 `.cache/stage3d/sc1-b1/`；B9/B7 仅做实现前只读审计，SC1 未退出。

- 2026-09-22 SC0-B4：预算冻结与[原型移交清单](SC0-HANDOFF.md)完成，B1/B2/B3/B5证据及哈希复核通过；入库政策、初始调度上限与实际负载分别记录于3D-ASSETS §15，high单位由100+收敛为100。两套客户端类型检查、客户端800项测试及本批`verify:all`通过，验证基线修复已独立提交（UI类型、Confirm/PSD契约断言与MMO测试时钟）。数字、边界与验证日志哈希见[SC0汇总](perf/stage3d/2026-09-22-sc0-review.json)；SC0退出并打轻量tag `sc0-exit`（解析tag即本批commit），SC1未开始。以下旧进展按当时批次口径保留。

- 2026-09-22 SC0-B1：内置新管线、两个保留层位与 Spine 4.2 配置已落地；按用户确认将登录页 Spine 3.8.99 装饰动画改为原 idle 首帧静态展示，保留原素材归档，真实 4.2 预览无该资源错误。按 2026-09-22 用户范围调整，移除微信测试项目 / AppID 与可运行构建证据要求；既有配置、预览与该批 `verify:all` 已通过，B1 完成。SC0 尚待 B4 冻结与原型移交，预算仍候选，SC1 尚未开始。

- 2026-09-22 SC0-B2：四份自制灰盒与外置 64² 棋盘 PNG、确定性生成器及结构反例测试已交付；Creator 3.8.8 实际导入并从 gltf-scene 子路径加载，数字摘要见 [creator-import-report.json](../tools/art3d/creator-import-report.json)。灰盒命名与尺寸例外为精确临时登记，蒙皮 CPU 读取保留理由和数据量下界已登记；SC0 仍未退出。 当前批次 `verify:all`、`verify:sync` 及生成器 8 项反例测试通过。

- 2026-09-22 SC0-B3：真实 Cocos 页面与 Snake 载体的输入原型、相机叠加、蒙皮分组及回收验收通过，当前批次 `verify:all` 通过。WebGL2 / WebGL1 浮点 / WebGL1 显式 RGBA8 能力故障注入各完成 18 步；500 立方体实际提交、100 蒙皮中两动画同播及跨关节纹理切换正确，实时样本关闭 instancing 并可恢复。三路径各预热 60 帧、采样 240 帧，原始帧间隔 p95 为 18.7 / 18.9 / 18.8 ms，启动长帧最大值 120.5 / 148.7 / 126.6 ms 保留；各连续开关 20 次，关闭节点与业务引用回基线，GFX 增量为 0。Snake 两上下文各 10 步、32 条 trusted DOM 输入通过；wheel 由夹具覆盖。汇总见 [B3 审阅报告](perf/stage3d/2026-09-22-spike-review.json)，原始报告及截图留本地。该结果限于桌面原型，不是微信真机或正式 SC1 框架交付；B1 已按修订后的要求完成，B4 预算与原型移交尚未冻结，SC0 未退出。

- 2026-09-22 SC0-B5：Creator 3.8.8 官方 LightFX 烘焙产出、独立 `stage3d/P_Stage3d_Baked` 及依赖已交付；关闭作者场景后，主场景仅按 Prefab 路径加载，在 WebGL2 / WebGL1 均通过，作者态与独立加载的固定机位画面复核一致。两上下文各预热 60 帧、采样 240 帧，p95 为 18.7 / 18.5 ms；各开关 20 次后业务引用归零、节点回基线、GFX 增量为 0。实际拦截 lightmap PNG 返回 404，探针定位到节点、UUID、路径及错误尺寸，解除拦截后重试成功且回收干净；当前批次 `verify:all` 通过。证据摘要见 [B5 审阅报告](perf/stage3d/2026-09-22-baked-review.json)。采样例外仅匹配该 PNG / meta 的精确路径、UUID 与 SHA，限已验证固定距离，不证明连续缩放或 mip 链保真。B4 冻结与原型移交仍待完成，SC0 未退出。

- 2026-09-22 验收范围调整：按用户要求移除微信测试项目 / AppID、微信构建成功及产物可运行证据作为 3D 前置 / 验收 / 退出条件的条款，同步 SC0-B1/B4、设计、消费方边界及探针后续输出。SC0-B1 依既有配置、预览和机检证据完成；B4 仍须冻结预算与原型移交清单。WebGL1 逐阶段证据与 SC4 真实微信 low 档 / 远程加载 / 缓存验收继续按原阶段执行。本轮 61 项相关探针测试、两套客户端类型检查、能力登记、镜像与包锁检查通过；`verify:all` 在 UniFlex 类型检查因 `SettingsRestored.tsx` 的未使用 `ImageRef` 导入失败，客户端测试 798 / 800 通过、两项 Confirm 回归失败。该类型错误及两项失败均已在同步基线 `781f5d8d` 原样复现，本轮全量检查不记通过。

- 2026-09-19 文档 v1.2：采纳 §1.3 的 3D-23–3D-32；新增 SC0-B5、SC1-B8/B9，补齐全局租约、输入、画质、资产闸与离线 LOD 的施工及退出条件。仅文档修订，以上未勾选项仍未实施。
- 2026-09-19 文档 v1.3：采纳 §1.4 的 3D-33–3D-40；SC0-B2 / B3、SC1-B2 / B3 / B7 / B9、§0 / §4.2 更新。仍未实施。
- 2026-09-19 SD10 补拍：首发小游戏 / WebGL1 消费方 = lvr（§0 / §4.1 R0 行 / SC4-B3 / §7 / P11；P7 按 3D-34 修正）。仍未实施。

- 2026-09-22 文档 v1.4：采纳 §1.5 的 3D-41–3D-45、3D-47，修订 raw-input 前置归属 / 取消、蒙皮 jointTexture 分组、SC1 真实同步 retainer、序列化 UUID 闭合 / 干净安装、原始帧间隔 ms、真实微信缓存退出门；mmo 接入改为冻结 2D 基线之后的可选增量并对齐 mount / unmount 与 services 入口。仅文档修订，素材数字仍候选，未实施任何能力、未新增批次勾选。
- 2026-09-22 文档 v1.5：按当前范围精简平台验收条目；现行第五轮审阅保留 3D-41–3D-45、3D-47 六项，编号不重排。仅文档修订，素材数字仍候选，未实施任何能力、未新增批次勾选。
