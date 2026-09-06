# Godogen 对照吸收开发计划

> 版本：合并版（2026-08-29）。由三层笔记（原对照清单 + 两轮复核回填）合并为单一可执行计划；
> 合并前的分层原文见 git 历史 `0ea018c`、`0b31c6a`。
>
> 对照版本（两个仓库的默认分支都是 `master`，不是 `main`）：
> - [htdt/godogen@05cebff](https://github.com/htdt/godogen/tree/05cebffc8b10c5817e8a3db495b82e7b6004ab84)
> - [liangdabiao/Godogen@8f31578](https://github.com/liangdabiao/Godogen/tree/8f315780bf50eea1875e08c8b614930e9d6e8450)
>
> 定位：本文是**对外部项目的对照吸收计划**，不是本仓能力承诺。其中的任务不进入 `verify:core`
> 的既有门禁口径，也不改变 [plan-v5.md](plan-v5.md) 的核心优先级；两者分工见 §7。
>
> 接手须知：先读 §2（吸收边界）再动手——里面有一条「看起来很有说服力但会直接摧毁本仓价值」的
> 负面经验，以及两个来源仓库不可直接取用的具体原因。

## 1. 这份计划要解决什么

两个 Godogen 仓库最值得吸收的不是 Godot 的节点/场景架构，而是**从需求到可运行垂直切片的生产方法**：

1. 运行结果必须被实际执行、捕获和复核，不能只以编译通过作为完成证明。
2. 资产要有尺寸、用途、来源和生成过程记录，并在进入昂贵下游处理前做低成本检查。
3. 把可复用的玩法规格转换为跨 shared/server/client/View/测试登记点的确定性脚手架。

gameStarterKit 在 shared 单源、镜像同步、协议指纹、View/Logic 分层、房间生命周期和服务端一致性上
已经比两个 Godogen 仓库更适合作为长期基础。**当前短板集中在三处**：Creator 真引擎验证、资产治理、
新玩法内容生产。本计划只补这三处，不为引入 Godogen 而削弱现有边界。

两个来源仓库的形态差异，决定了可吸收的粒度：

- **htdt/godogen**：已收敛为「薄运行清单 + 一页引擎指南 + 资产技能」。它的 `prompts/runtime.md`
  只有 1127 字节，核心是一条纪律——`Judge progress from the running game, never from a clean build`；
  怎么产生证据全部下沉到各引擎指南。
- **liangdabiao/Godogen**：基于较早形态的中文增强版，保留了重流程
  （需求 → 视觉目标 → PLAN/STRUCTURE/ASSETS → 场景脚本 → headless 校验 → 截图 → 视觉 QA → 演示视频）。
  适合当检查清单素材，**不适合作为本仓依赖或代码基线**。

## 2. 吸收边界（动手前必读）

### 2.1 不吸收的内容

1. 不替换现有 shared、协议指纹、镜像同步、FGUI manifest、View/Logic、GameplayRegistry、
   lock/fence 和 outbox 边界。
2. 不把 Godot scene builder、GDScript quirks、Bevy/Babylon 捕获方式转成 Cocos 架构规则。
3. 不复制「代理现场重建整个项目」的模式；本仓的确定性目录和生成物约束是资产，不是负担。
4. 不复制两个仓库的 `publish.sh` 与 ignore 策略（原因见 §2.2、§2.3）。
5. 不把 AI 生成图、AI 视觉评审或 README 中的声明当作完成证据。
6. **⛔ 不引用「模型已经会了」作为削减任何既有门禁的理由。** htdt 删除全部流水线与门禁的自述理由是
   `removing guidance the current model no longer needs`，更早一条删除外部验证环节的理由是
   `external pass added no signal`。这个推理**在它的语境里成立**——产物是一次性游戏仓库，错了重跑一次；
   搬到本仓**完全不成立**：本仓门禁存在的理由从来不是「模型不会」，而是「多人多次改动之后不能静默破坏
   契约」。门禁的裁撤只能以「该不变量已被另一条更强的机检覆盖」为由。

### 2.2 两个来源仓库的工程负债（不要直接取用它们的脚本）

- 资产工具的 Python 依赖八个包零版本约束；提议加版本下界的 PR **被维护者关闭未合并**。
- `setup.md` 的 macOS symlink 步骤被 issue 报告「会让每次 headless 调用永久挂起」，报告后仍是文档首选路径。
- 两个 `publish.sh` 的 `--force` 分支都对**用户传入的任意目录**执行 `rm -rf`。
- liangdabiao 用 `git clone` Godot **master** 生成 API 文档，却把引擎二进制钉在具体版本路径——
  文档与引擎按构造必然漂移。这恰好反证 T5「API 资料必须绑定锁定版本」的必要性。

### 2.3 反向证据：它们印证了本仓既有规则

liangdabiao 自己交付的样例游戏 `journey-runner`，**clone 下来渲染不出它自己 PLAN.md 里那张图**：
`scenes/main.tscn` 的三个 `Sprite2D` 没有任何 `texture =` 赋值，`scripts/player.gd` 引用
`res://assets/img/test_fox_run.png`，而 `assets` 在 `.gitignore` 里；同时 1.37 MB 的 AI 概念图
`reference.png` **入库了**。愿望入库、事实丢弃。

两家写进目标仓库的 ignore 列表还都包含 `*.import`——那正是 Cocos `.meta` 的对应物，忽略它等于放弃
资源身份的版本化。因此本计划涉及资产时的边界固定为：**运行时真源资产 + `.meta` 入库，只忽略缓存、
截图和中间产物，不能反过来。**

## 3. 执行顺序

```text
T1 verify:creator 最小路径
  → T2 资产 manifest（先「意图尺度」最小子集，再扩全字段）
  → T3 Underground Idle 最小垂直切片 → codegen:gameplay 泛化
  → T4 视觉验收 case
  → T5 Cocos/FGUI 运行时陷阱库
  → T6 助手指令单源化（成本近零，可随时插入）
  → T7 付费资产任务器与离线工具（有真实需求再做）
```

⚠ 原列首位的「产物往返自检」已移出本文，登记为
[`docs/EXTRAS.md` §3.10](docs/EXTRAS.md#310-产物往返自检导出物反序列化校验)（状态：未实现）。
它不依赖真引擎、成本最低，仍建议在下列任务之前先落地；实施边界以该节为准。

排序理由：T2 拆成两步，避免完整字段表拖住整条链。每一步都保留现有核心门禁，Creator/资产证据作为
**额外能力**登记，不把尚未覆盖的真实引擎边界写成 `verify:core` 已通过。

## 4. 任务

### T1 verify:creator 最小路径（P1）

**为什么**：本仓客户端 217 个测试跑在 cc 桩上，桩与真引擎不一致的风险**已经实际发生过两次**
（两次扩 `cc-stub.d.ts`）。当前文档明确把 Creator 真实资源导入、渲染和交互留在人工预览边界，
见 [`docs/CLIENT.md`](docs/CLIENT.md#8-本地检查) 与
[`docs/OVERVIEW.md`](docs/OVERVIEW.md#32-约束可执行)。

一个有利条件：帧捕获要可复现，前提是确定性（固定步长、seeded RNG、input tape）——**本仓已经具备这三样**，
这是「命令 trace → 像素」路径成本较低的真正原因。

- [ ] 增加**可选** `verify:creator` 命令，不立即并入 `verify:core`。
- [ ] 通过 Cocos CLI 构建 Web 预览并启动可测试入口。
- [ ] **首个里程碑先做确定性 in-engine smoke**：真实 Creator 工程加载 scene、挂载 `Main`、逐个
  `ViewMgr.open` 已注册页面并断言无异常。它是 headless 桩与截图 QA 之间的中间层，能抓「桩与真引擎行为
  不一致」，结果确定、可直接进门禁。
- [ ] 用固定 seed 和脚本输入覆盖登录、区服列表、首页、ballMove 等最小路径。
- [ ] **不要「等 ready」，而是二选一并写死**：保证第 0 帧就是有效状态（对照 Godot 配方把相机在
  `_Initialize` 里预置好，因为首帧在 `_Process` 之前渲染），或使用显式 ready flag（Babylon 配方）。
  ⛔ 不靠固定延时。本仓 ViewMgr 已有 mount/ready 语义，两条路都通。
- [ ] **检测软件渲染并拒绝下结论**：读 WebGL `RENDERER`，命中 `swiftshader`/`llvmpipe`/`lavapipe` 时
  报告并跳过出图，而不是产出一张误导性的空白/慢帧。无头环境下这条是必须的。
- [ ] 检查项：console 错误、资源加载错误、canvas 非空、关键节点存在。
- [ ] 在 `750×1624` 及至少一个安全区/不同高度视口下截取关键画面和短多帧序列。
- [ ] 证据保存到被忽略的构建/测试产物目录，记录 seed、输入 tape、viewport、引擎版本和时间戳。
- [ ] golden 截图只做**同机回归辅助**，不做跨机/跨 GPU 门禁；初期以结构性检查和人工复核为主，
  不用易受 GPU/平台差异影响的像素差异作为唯一门禁。

**完成标准**：`verify:creator` 能在本机稳定复现同一组结构性断言；故意破坏一个页面的必需包/节点后变红；
软件渲染环境下明确报告「未产出视觉证据」而不是给出假绿。

### T2 资产 manifest（P1，两步走）

**为什么**：Godogen 强制记录米制、贴图覆盖尺度或显示像素。值得单独强调的原则是——**它记的是意图尺度，
不是文件尺寸**：文件像素引擎自己能读，「这张图该显示成多大」读不出来。其立论理由是原文那句
「没有它，coders consistently scale assets wrong」。htdt 那张表只有
`Name / Description / Size / Path / Cost` 五列，其中 in-game Size 按资产类型切换单位
（3D 用米、贴图用 tile 尺寸、背景用像素+行为词、精灵用显示像素）。

**第一步（先落地，成本极低）**

- [ ] 先只加「用途 + 意图显示尺寸」两列，立刻能防导入比例错误，不等完整字段表就绪。

**第二步（扩到完整结构）**

- [ ] 在 `apps/art` 真源侧增加结构化 manifest，不把它塞进普通 README。
- [ ] 记录源文件、导出文件、内容 hash、像素尺寸和游戏内逻辑显示尺寸。
- [ ] 记录 pivot、九宫格/切片规则、FairyGUI package/resource ID 和实际用途。
- [ ] 记录来源、许可证、生成模型、prompt hash、任务 ID、成本和人工审核状态。
- [ ] 接入现有 `verify:fgui` 或 inventory，检查缺失、孤儿、hash 漂移和尺寸字段完整性。
- [ ] 最终运行时资源和 `.meta` 继续按本仓规则受控提交；只忽略缓存、截图和中间产物（见 §2.3）。

**完成标准**：新增一张图但漏填意图尺寸时本地检查变红；manifest 与实际导出物的缺失/孤儿/hash 漂移可被发现。

### T3 新玩法脚手架化（P1）

- [ ] 设计机器可读的 gameplay spec，至少包含 canonical mode、页面、输入/action、RPC、状态、资源和验收 fixture。
- [ ] 增加确定性 `codegen:gameplay`，生成 shared mode、server mode、client room/logic/catalog、
  View 占位和测试模板。
- [ ] 生成器只修改已登记的接缝，不复制协议字符串，不绕过 `sync:shared`、`sync:client`、FGUI codegen 和 inventory。
- [ ] **先用 `docs/undergroundIdle/` 做一个最小垂直切片试点**；完成后再决定是否扩展为通用工具。
- [ ] 对生成结果增加正例和反例测试，确保重复运行幂等、不会覆盖用户手写区。

**完成标准**：同一 spec 连续生成两次零 diff；手写区被修改后重跑不被覆盖；生成物能通过既有全部门禁。

### T4 视觉验收 case（P2）

- [ ] 为高风险页面/玩法记录 `goal / fixture / viewport / actions / assertions / reference`。
- [ ] 优先覆盖动画、shader、粒子、动态包加载、复杂转场、安全区、长数字和满仓等状态。
- [ ] 视觉目标应是**人工确认的可实现画面**，不让生成式概念图替代产品或协议规格。
- [ ] AI 视觉 QA 只作辅助意见；确定性断言、资源错误和可完成性检查仍由脚本负责。

### T5 Cocos/FGUI 运行时陷阱库（P2）

**为什么**：htdt 引擎指南的入选门槛写死在小标题里——`Quirks worth knowing (silent-failure)`，
即**只收录「编译通过 / 无报错，但结果是错的」**那一类；能被编译拦住的和肉眼能看出来的都不写。

- [ ] 一次性发现留在功能记录；重复出现的「编译通过但运行错误」再提升到就近客户端文档。
- [ ] 能自动判断的规则必须进入测试或 verify 脚本，文档只保留上下文和修复方法。
- [ ] 维护**良性噪声白名单**：明确列出「可忽略的报错」（对照 Godot headless 退出时的 RID-leak 警告），
  否则执行者会去修不存在的问题。
- [ ] API 资料必须绑定 Cocos Creator 3.8.8、FairyGUI 1.2.2 和仓库 vendor hash，不能抓取未锁定最新版。

### T6 助手指令单源化（P2，成本近零）

**为什么**：htdt 的 `CLAUDE.md` 是指向 `AGENTS.md` 的 9 字节 symlink（git tree mode `120000`，已核实见 §6.2）。
本仓当前靠 `verify-inventory` 的「除空白外全文一致 + 必备条款」门禁维持两份重复文件。

- [ ] 落地形式二选一：symlink（注意 Windows checkout 的 `core.symlinks` 兼容）；或由 `init:project`
  从单一真源渲染两份（与本仓「生成物不自相矛盾」的既有模式一致，更稳）。
- [ ] 单源化后同步简化或删除 `scripts/verify-inventory.mjs` 的对应条款与反向测试。

### T7 付费资产任务器与离线工具（P2，按需）

- [ ] **先独立吸收无外部服务的部分**：宫格切片、透明边缘预览、动画循环点检测，并为其加入小型 fixture 测试。
- [ ] 只有在实际需要付费资产生成时，才引入 provider 抽象和任务器。
- [ ] 任务状态使用输入 hash、task ID、原子写入、pending 冷启动保护、输出 hash 和预算硬闸。
  参考 htdt 的 **write-ahead sidecar**：`submit → 先把 task_id 落盘 → 再 poll`，超时不算失败而是给出
  可续跑指令，保证崩溃时钱不白花。（本仓 outbox 的「先落 durable intent 再 apply」是同一形状。）
- [ ] Python 依赖必须锁定并做 provider 契约测试，⛔ 不直接复制 Godogen 的 API 客户端（见 §2.2）。

## 5. 观察项（不排期）

- **FairyGUI 逐类 API 参考**：原为 P2 待办，现降为观察项。理由：htdt 在 `9ac4d84` 那次重构中**删除了
  `godot-api` 整套**（`godot_api_converter.py` 737 行、`gdscript.md` 804 行、`class_list.py` 645 行、
  `csharp.md` 621 行）；liangdabiao 仍保留它**只是因为 fork 早于删除**，不是两家独立验证过的好实践。
  动机口径也需修正：liang 自述理由是**上下文预算**（约 850 个类会吃光上下文窗口），而
  `fairygui.d.ts` 的类数量远小于 850，这一半动机基本不成立；成立的只有「训练数据稀薄」那一半。
  只有出现「反复因 FairyGUI API 记忆错误返工」的实际记录时再评估，届时优先做**窄集**
  （本仓实际用到的十几个类）而非全量转换。
- **AGENTS 文档拆分为按需加载子文档**：对照 htdt 一次删除 8,401 行流水线的教训——重文档结构不等于更可靠。
  只在 `AGENTS.md` 增长到影响 token 预算时再评估，当前单文件成本可接受。
- **远程值守 / IM steer 形态**：对本仓核心开发暂不适用；若将来做全量美术重扫等长任务，可借用
  「无人值守 + 结束产 15–20s 证明录像」的交付形态。
- **历史审阅归档**：`plan.md` 已保留为 archive，当前状态、实现证据与后续收口只写入
  `plan-v5.md`，不再向历史多轮复核记录叠加新结论。

## 6. 事实核实与来源

### 6.1 抓取注意事项

- 两个仓库的默认分支都是 **`master`**；按 `raw.githubusercontent.com/.../main/...` 抓取会全部 404。
  本文与下方证据钉的是 commit SHA，不受影响。
- **`contents` API 会自动解引用 symlink**：对 htdt 的 `CLAUDE.md` 返回 `type:"file", size:1216`
  （即 `AGENTS.md` 的大小），据此会得出「不是 symlink」的**错误**结论。只有 **git tree API** 暴露
  `mode:120000`。复核 symlink 类声称时必须用 tree API。

### 6.2 已核实的关键事实

| 声称 | 结论 | 证据 |
| --- | --- | --- |
| htdt `CLAUDE.md` 是指向 `AGENTS.md` 的 9 字节 symlink | **属实** | git tree API：`CLAUDE.md` mode `120000`、size 9、blob 内容为 `AGENTS.md`（无换行）；`AGENTS.md` mode `100644`、size 1216 |
| 「2026-07-02 一次删除约 8,400 行」 | **属实，可精确到个位** | 提交 `9ac4d84`：87 文件、**+458 / −8,401** |
| 该次删除包含 `godot-api` 整套 | **属实** | 见 §5 第一条的四个文件与行数 |

⚠ CHANGELOG 原文**没有行数**，`8,401` 来自 commit stats；引用时应注明来源，否则无法复算。

### 6.3 外部证据索引

- htdt 提交 `9ac4d84`「Docs-only runtime」：87 文件、+458 / −8,401（commit stats）
- [htdt `prompts/runtime.md`](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/prompts/runtime.md)
  （1127 字节）：`Judge progress from the running game, never from a clean build`
- htdt `AGENTS.md`（1216 字节，`CLAUDE.md` 为其 symlink）的 Editing Rules 三条
- htdt `engines/godot.md` 的 `Quirks worth knowing (silent-failure)` 与 `PackAndSave` 往返自检
- htdt `engines/babylon.md` 的 ready-flag 与 WebGL `RENDERER` 软件渲染检测
- [htdt 资产技能与尺寸清单](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/asset-gen/SKILL.md#L81-L124)
- [htdt 重构记录](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/CHANGELOG.md#L3-L9)
- [liangdabiao 编排器](https://github.com/liangdabiao/Godogen/blob/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godogen/SKILL.md#L13-L117)
- [liangdabiao 任务执行与视觉 QA](https://github.com/liangdabiao/Godogen/blob/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godogen/task-execution.md#L22-L44)
- [liangdabiao 资产规划](https://github.com/liangdabiao/Godogen/blob/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godogen/asset-planner.md#L67-L169)
- liangdabiao `journey-runner/scenes/build_*.gd` 的 `validate_packed_scene` 往返自检
- [liangdabiao godot-api 转换器与逐类文档](https://github.com/liangdabiao/Godogen/tree/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godot-api)
- 本仓真源：[`docs/CLIENT.md`](docs/CLIENT.md#8-本地检查)、
  [`docs/OVERVIEW.md`](docs/OVERVIEW.md#32-约束可执行)、
  [Underground Idle 美术制作流程](docs/undergroundIdle/07-art-direction.md#13-制作流程)、
  `apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts`、
  `tools/client-perf-baseline.ts` 的 `renderBallMoveWorld` trace 校验链

## 7. 与 `plan-v5.md` 的分工

- [plan-v5.md](plan-v5.md) 是**核心问题、实施状态与验收证据的唯一真相**，其条目状态由对应门禁背书。
- 本文是**额外能力的对照吸收计划**：任务完成前不得写进 `plan-v5.md` 的完成声明，也不得据此放宽
  `verify:core` / `verify:all` 的口径。
- 本文任务若产出新的门禁（如 T1 的 `verify:creator`），应在落地时按本仓既有规则登记到
  `docs/inventory.json` 并补正反例，再考虑是否并入聚合命令；已移出的产物往返自检同此要求，
  见 [`docs/EXTRAS.md` §3.10](docs/EXTRAS.md#310-产物往返自检导出物反序列化校验)。
- 研究过程中对两个外部仓库的只读调研不改动本仓任何其它文件。
