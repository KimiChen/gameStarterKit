# Godogen 对照吸收清单

> 评审日期：2026-08-29
>
> 对照版本：
> - [htdt/godogen@05cebff](https://github.com/htdt/godogen/tree/05cebffc8b10c5817e8a3db495b82e7b6004ab84)
> - [liangdabiao/Godogen@8f31578](https://github.com/liangdabiao/Godogen/tree/8f315780bf50eea1875e08c8b614930e9d6e8450)

## 1. 总结

最值得吸收的不是 Godot 节点或场景架构，而是从需求到可运行垂直切片的生产方法：

1. 运行结果必须被实际执行、捕获和复核，不能只以编译通过作为完成证明。
2. 资产要有尺寸、用途、来源和生成过程记录，并在进入昂贵下游处理前做低成本检查。
3. 高风险特性先做最小验证，普通功能保持连续迭代，避免把所有工作拆成僵化的阶段管线。
4. 把可复用的玩法规格转换为跨 shared、server、client、View 和测试登记点的确定性脚手架。

gameStarterKit 在 shared 单源、镜像同步、协议指纹、View/Logic 分层、房间生命周期和服务端一致性上已经
比两个 Godogen 仓库更适合作为长期基础。当前主要短板是 Creator 真引擎验证、资产治理和新玩法内容生产，
不应为了引入 Godogen 而削弱现有边界。

## 2. 两个项目的定位

### 2.1 htdt/godogen

当前主分支已经收敛为“薄运行清单 + 引擎指南 + 资产技能”。
[`prompts/runtime.md`](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/prompts/runtime.md)
要求代理从运行中的游戏判断结果；引擎指南提供等待 ready、固定帧率、离屏捕获和静默故障提示。

重要的演进信号是其 2026-07-02 的重构：一次删除约 8,400 行多阶段技能、脚手架、hook 和 API 帮助器，
只保留模型难以快速发现的运行时陷阱和证明流程。
这说明完整的代理流水线未必比短而可执行的规则更可靠。

可借鉴的重点：

- 运行证明和短视频/截图闭环；
- 付费或长耗时资产任务的 task-id、sidecar 和 resume 思路；
- 资产清单中的游戏内显示尺寸；
- 结果 JSON 与诊断 stderr 分离；
- 只把“能编译但运行时容易错”的知识放进就近指南。

### 2.2 liangdabiao/Godogen

这是基于较早 Godogen 形态的中文增强版，保留了更重的固定流程：

```text
需求 → 视觉目标 → PLAN.md → STRUCTURE.md → ASSETS.md
     → 场景/脚本 → headless 校验 → 截图 → 视觉 QA → 演示视频
```

它在视觉目标、风险任务、资产锚点/派生、项目记忆和多帧视觉检查方面提供了很好的方法论素材。
但它更适合作为检查清单，不适合作为本仓依赖或代码基线。

## 3. 待办清单

### P1：补 Creator 真实运行证据

- [ ] 增加可选 `verify:creator` 命令，不立即并入 `verify:core`。
- [ ] 通过 Cocos CLI 构建 Web 预览并启动可测试入口。
- [ ] 用固定 seed 和脚本输入覆盖登录、区服列表、首页、ballMove 等最小路径。
- [ ] 等待显式 ready 信号后再检查：console 错误、资源加载错误、canvas 非空和关键节点存在。
- [ ] 在 `750×1624` 及至少一个安全区/不同高度视口下截取关键画面和短多帧序列。
- [ ] 将证据保存到被忽略的构建/测试产物目录，记录 seed、输入 tape、viewport、引擎版本和时间戳。
- [ ] 初期以结构性检查和人工复核为主，不用易受 GPU/平台差异影响的像素差异作为唯一门禁。

背景：当前文档明确把 Creator 真实资源导入、渲染和交互留在人工预览边界，见
[`docs/CLIENT.md`](docs/CLIENT.md#L332) 和 [`docs/OVERVIEW.md`](docs/OVERVIEW.md#L79)。

### P1：建立运行时资产 manifest

- [ ] 在 `apps/art` 真源侧增加结构化 manifest，不把它塞进普通 README。
- [ ] 记录源文件、导出文件、内容 hash、像素尺寸和游戏内逻辑显示尺寸。
- [ ] 记录 pivot、九宫格/切片规则、FairyGUI package/resource ID 和实际用途。
- [ ] 记录来源、许可证、生成模型、prompt hash、任务 ID、成本和人工审核状态。
- [ ] 接入现有 `verify:fgui` 或 inventory，检查缺失、孤儿、hash 漂移和尺寸字段完整性。
- [ ] 最终运行时资源和 `.meta` 继续按本仓规则受控提交；只忽略缓存、截图和中间产物。

参考：Godogen 强制记录米制、贴图覆盖尺度或显示像素；这比只记录源分辨率更能避免导入后比例错误。

### P1：把新玩法脚手架化

- [ ] 设计机器可读的 gameplay spec，至少包含 canonical mode、页面、输入/action、RPC、状态、资源和验收 fixture。
- [ ] 增加确定性 `codegen:gameplay`，生成 shared mode、server mode、client room/logic/catalog、View 占位和测试模板。
- [ ] 生成器只修改已登记的接缝，不复制协议字符串，不绕过 `sync:shared`、`sync:client`、FGUI codegen 和 inventory。
- [ ] 先用 `docs/undergroundIdle/` 做一个最小垂直切片试点；完成后再决定是否扩展为通用工具。
- [ ] 对生成结果增加正例和反例测试，确保重复运行幂等、不会覆盖用户手写区。

### P2：建立视觉验收 case

- [ ] 为高风险页面/玩法记录 `goal / fixture / viewport / actions / assertions / reference`。
- [ ] 优先覆盖动画、shader、粒子、动态包加载、复杂转场、安全区、长数字和满仓等状态。
- [ ] 视觉目标应是人工确认的可实现画面，不让生成式概念图替代产品或协议规格。
- [ ] AI 视觉 QA 只作辅助意见；确定性断言、资源错误和可完成性检查仍由脚本负责。

### P2：可选资产任务器和离线工具

- [ ] 只有在实际需要付费资产生成时，才引入 provider 抽象和任务器。
- [ ] 任务状态使用输入 hash、task ID、原子写入、pending 冷启动保护、输出 hash 和预算硬闸。
- [ ] 先独立吸收无外部服务的宫格切片、透明边缘预览和动画循环点检测，并为其加入小型 fixture 测试。
- [ ] Python 依赖必须锁定并做 provider 契约测试，不直接复制 Godogen 的 API 客户端。

### P2：维护 Cocos/FGUI 运行时陷阱库

- [ ] 一次性发现留在功能记录；重复出现的“编译通过但运行错误”再提升到就近客户端文档。
- [ ] 能自动判断的规则必须进入测试或 verify 脚本，文档只保留上下文和修复方法。
- [ ] API 资料必须绑定 Cocos Creator 3.8.8、FairyGUI 1.2.2 和仓库 vendor hash，不能抓取未锁定最新版。

## 4. 不吸收的内容

1. 不替换现有 shared、协议指纹、镜像同步、FGUI manifest、View/Logic、GameplayRegistry、lock/fence 和 outbox 边界。
2. 不把 Godot scene builder、GDScript quirks、Bevy/Babylon 捕获方式转成 Cocos 架构规则。
3. 不复制“代理现场重建整个项目”的模式；本仓的确定性目录和生成物约束是资产，不是负担。
4. 不复制两个仓库的 `publish.sh` 和忽略策略。中文增强版脚本引用不存在的 `skills/` 路径，并含
   `D:/game-test/...` 硬编码；两个项目都倾向忽略最终资产，这与本仓提交资源和 `.meta` 以保持可复现的规则冲突。
5. 不把 AI 生成图、AI 视觉评审或 README 中的声明当作完成证据。

## 5. 推荐执行顺序

```text
1. verify:creator 最小路径
   → 2. 资产 manifest 与校验
   → 3. Underground Idle 最小垂直切片
   → 4. codegen:gameplay 泛化
   → 5. 付费资产任务器（有真实需求再做）
```

每一步都应保留现有核心门禁，并将 Creator/资产证据作为额外能力登记，不把尚未覆盖的真实引擎边界写成
`verify:core` 已通过。

## 6. 外部证据

- [htdt runtime manifest](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/prompts/runtime.md#L1-L11)
- [htdt 资产技能与尺寸清单](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/asset-gen/SKILL.md#L81-L124)
- [htdt 重构记录](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/CHANGELOG.md#L3-L9)
- [liangdabiao 编排器](https://github.com/liangdabiao/Godogen/blob/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godogen/SKILL.md#L13-L117)
- [liangdabiao 任务执行与视觉 QA](https://github.com/liangdabiao/Godogen/blob/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godogen/task-execution.md#L22-L44)
- [liangdabiao 资产规划](https://github.com/liangdabiao/Godogen/blob/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godogen/asset-planner.md#L67-L169)
- [当前客户端预览边界](docs/CLIENT.md#L332)
- [当前 Underground Idle 美术制作流程](docs/undergroundIdle/07-art-direction.md#L342-L386)

本轮只读研究后写入本文件，未修改其他已有文件。

---

## 7. 补充建议（2026-08-29 复核回填）

> 在上方清单基础上补充。重叠处只写增量与分工细节，不重复登记；出处见 §7.6。

### 7.1 与上方清单方向一致、不另立条目

以下方向与同事清单结论一致，不再重复展开：

- **视觉证据**：golden 截图/视觉 QA 的思路与 P1 `verify:creator` + P2 视觉验收 case 重合；
- **资产语义**：AI 导航需要的 ASSETS 语义清单，同事的 P1 资产 manifest（用途/pivot/显示尺寸/来源/审核状态）
  已覆盖且更完整；
- **陷阱库**：quirks.md 思路与 P2「运行时陷阱库」一致，赞同「能自动判断的规则必须进测试或 verify 脚本，
  文档只留上下文」的分层；
- **反向结论**：两个 Godogen 恰好反证本仓静态门禁的价值——视觉 QA 证明不了「结算对不对、钱有没有重复
  入账」，那是 outbox/effect 测试的领域；应吸收的是「引擎画面层的证据」，不是「放弃静态门禁换生成速度」。

### 7.2 新增：助手指令单源化（建议 P2，成本近零）

- [ ] 消除 `AGENTS.md`/`CLAUDE.md` 双文件手工同步：htdt 的 `CLAUDE.md` 是指向 `AGENTS.md` 的 9 字节
  symlink（git tree mode `120000`）。本仓当前靠 verify-inventory 的「除空白外全文一致 + 必备条款」门禁
  维持重复，单源化后该门禁可简化或删除。
- [ ] 落地形式二选一：symlink（注意 Windows checkout 的 `core.symlinks` 兼容）；或由 `init:project`
  从单一真源渲染两份（与本仓「生成物不自相矛盾」的既有模式一致，更稳）。
- [ ] 同步更新 `scripts/verify-inventory.mjs` 对应条款与反向测试。

### 7.3 新增：FairyGUI 延迟加载 API 参考（挂在 P2 陷阱库条目下实施）

> ⚠ 本条前提已被 §8.2 推翻：htdt 在同一次重构中删除了 `godot-api`（含 `godot_api_converter.py`），
> liangdabiao 保留它只是因为 fork 早于删除；且其原始动机是上下文预算而非训练数据稀薄。
> 建议按 §8.2 降为观察项后再决定是否实施。

- [ ] 以入库真源 `apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts` 转换生成按类一份的 markdown
  参考（对照 `godot_api_converter.py` 的做法），配合逐类延迟加载，弥补 LLM 对 FairyGUI 训练数据的稀薄。
- [ ] 生成物绑定 vendor hash（`scripts/vendor.sha256`），与 P2「API 资料必须绑定锁定版本」一致；
  转换器与产物分别入测试和 verify 链，不手改生成物。

### 7.4 对 P1 `verify:creator` 的两个实施增量

- [ ] 首个里程碑先做**确定性 in-engine smoke**：真实 Creator 工程加载 scene、挂载 `Main`、逐个
  `ViewMgr.open` 已注册页面并断言无异常。它是 headless 桩与截图 QA 之间的中间层，能抓「桩与真引擎行为
  不一致」（本仓已两次扩充 cc-stub，证明该风险真实存在），且结果确定、可直接进门禁。
- [ ] golden 截图只做**同机回归辅助**，不做跨机/跨 GPU 门禁（与上文「不用像素差异作为唯一门禁」一致）。
  视觉证据链可视为 `renderBallMoveWorld` 命令 trace 校验向像素层的自然延伸：命令序列 → 像素。

### 7.5 P3 观察项（当前不排期）

- AGENTS 文档拆分为按需加载子文档：对照 htdt 2026-07 删除约 8,400 行流水线的教训——重文档结构不等于
  更可靠。只在 AGENTS.md 增长到影响 token 预算时再评估，当前单文件成本可接受。
- 远程值守/IM steer 形态对本仓核心开发暂不适用；若将来做全量美术重扫等长任务，可借用「无人值守 +
  结束产 15–20s 证明录像」的交付形态。

### 7.6 追加外部证据

- [htdt CLAUDE.md 为 symlink（git tree mode 120000）](https://github.com/htdt/godogen/tree/05cebffc8b10c5817e8a3db495b82e7b6004ab84)
- [liangdabiao godot-api 转换器与逐类文档](https://github.com/liangdabiao/Godogen/tree/8f315780bf50eea1875e08c8b614930e9d6e8450/.claude/skills/godot-api)
- [liangdabiao 引擎内测试脚本目录](https://github.com/liangdabiao/Godogen/tree/8f315780bf50eea1875e08c8b614930e9d6e8450/journey-runner/test)
- 本仓真源：`apps/Cocos/extensions/fairygui-cc/runtime/fairygui.d.ts`、`tools/client-perf-baseline.ts`
  的 `renderBallMoveWorld` trace 校验链


---

## 8. 第二轮外部复核回填（2026-08-29）

> 独立重读两个仓库后的增量。与 §1–§7 重叠的一律不重复登记；本节只写「核实结论」「必须修正」「新增条目」
> 和「优先级分歧」。出处见 §8.9。

### 8.1 对既有声称的核实

| 声称 | 结论 | 证据 |
| --- | --- | --- |
| htdt `CLAUDE.md` 是指向 `AGENTS.md` 的 9 字节 symlink（§7.2） | **属实** | git tree API：`CLAUDE.md` mode `120000`、size 9，blob 内容为 `AGENTS.md`（无换行）；`AGENTS.md` mode `100644`、size 1216 |
| 「2026-07-02 一次删除约 8,400 行」（§2.1） | **属实，可精确到个位** | 提交 `9ac4d84`：87 文件、**+458 / −8,401** |
| 对照版本可按 `/main/` 重抓 | **否** | 默认分支是 `master`；`raw.githubusercontent.com/.../main/...` 全部 404。§2/§6 钉的是 commit SHA，本身无误，但后续复核者需注意 |

两点补充，避免下一轮踩同样的坑：

- **CHANGELOG 里没有行数**。`8,401` 来自 commit stats，不是原文；§2.1 引用时应注明来源，否则无法复算。
- **`contents` API 会反过来「证伪」symlink**：该端点自动解引用，对 `CLAUDE.md` 返回 `type:"file", size:1216`
  （即 AGENTS.md 的大小）。只有 **git tree API** 暴露 `mode:120000`。本轮初次核实即因此得出过相反结论。

### 8.2 必须修正：§7.3 的前提已被 htdt 自己推翻

`9ac4d84` 那次删除的内容里，正包含 §7.3 想要对照的那套东西：

| 删除行 | 文件 |
| --- | --- |
| 804 | `godot/skills/godot-api/gdscript.md` |
| 737 | `godot/skills/godot-api/tools/godot_api_converter.py` |
| 645 | `godot/skills/godot-api/tools/class_list.py` |
| 621 | `godot/skills/godot-api/csharp.md` |

liangdabiao 仍保留 `godot-api`，**不是两家独立验证过的好实践，而是同一份代码的新旧两态**——它 fork 早于删除。

动机口径也需修正：liang 自述的理由是**上下文预算**（约 850 个类一次性加载会吃光上下文窗口），
「LLM 训练数据稀薄」是另一份文件 `gdscript.md` 的动机（治 `:=` 对 `instantiate()` 失效这类会被从
Python/C# 猜错的坑）。对 FairyGUI 而言：`fairygui.d.ts` 的类数量远小于 850，**上下文预算这一半动机基本不
成立**；成立的只有「训练数据稀薄」那一半，收益低于 §7.3 预估，且已有一个做完又撤掉的先例。

- [ ] 将 §7.3 由「P2 待办」降为**观察项**，不排期；只有出现「反复因 FairyGUI API 记忆错误返工」的实际记录
  时再评估。届时优先做**窄集**（本仓实际用到的那十几个类），而不是全量 `.d.ts` 转换。

### 8.3 新增 P1：产物往返自检（round-trip assertion）

两个仓库**各自独立**在场景构建脚本里放了同一段自检，是本次调研里最值得直接搬的一条：

```text
build → 立刻 packed.instantiate() → 数节点 → 数量不符即 exit(1)，且不落盘
```

它防的是一类**静默**失败：`owner` 链未设全时 `PackedScene.pack()` 会悄悄丢节点，编译通过、保存成功、
运行时少东西。原文的定性很准确——「A silent drop otherwise looks like success.」
两处实现都强调 **gate the save on the validation result**（校验不过就不写文件）。

对本仓的意义：现有 `verify:fgui` 是**哈希型**门禁，回答「这个文件还是我记下的那个吗」；它回答不了
**「这个产物反序列化回来还是我以为的那个内容吗」**。FGUI `.bin` 导出、`.meta` uuid、Cocos 场景序列化都属于
「静默丢东西看起来像成功」的同一家族。往返自检是一类**新的**门禁维度，不是现有内容锁的重复。

- [ ] 选一个成本最低的落点先验证形状：对已导出的 FGUI `.bin` 做「解析回结构 → 与 `.fui`/契约声明的
  命名元素集合比对 → 不等即失败」，与现有 `verify:fgui` 并列而不是替换。
- [ ] 明确「不等即不落盘」的语义：往返自检失败时应阻止产物进入下游（codegen / manifest 重钉），
  而不是先写再报警。
- [ ] 其余候选（Cocos 场景、`.meta` 集合）先只登记，不实施——需要真引擎的部分并入 §3 的 `verify:creator`。
- [ ] 为自检本身补正反例（构造一个「刻意丢元素」的 fixture，断言门禁变红）。

### 8.4 对 §3/§7.4 `verify:creator` 的机制增量

三条来自引擎指南的具体做法，可直接映射到 Cocos web 构建：

- [ ] **不要「等 ready」，而是保证第 0 帧就有效**：Godot 配方把相机在 `_Initialize` 里预置好，因为首帧在
  `_Process` 之前渲染；Babylon 配方则用显式 ready flag。本仓 ViewMgr 已有 mount/ready 语义，两条路都通，
  但必须二选一并写死，不能靠固定延时。
- [ ] **检测软件渲染并拒绝下结论**：读 WebGL `RENDERER`，命中 `swiftshader`/`llvmpipe`/`lavapipe` 时
  报告并跳过出图，而不是产出一张误导性的空白/慢帧。对无头环境这条是必须的。
- [ ] **维护良性噪声白名单**：明确列出「可忽略的报错」（对照 Godot headless 退出时的 RID-leak 警告），
  否则执行者会去修不存在的问题。该清单归 §3 的 P2 陷阱库。

一个有利条件值得写明：帧捕获要可复现，前提是确定性（固定步长、seeded RNG、input tape）——**本仓已经具备
这三样**，这是 §7.4「命令 trace → 像素」路径成本较低的真正原因。

### 8.5 资产 manifest：先把「意图尺度」一列单独落地

§3 的资产 manifest 条目字段很全，但可以先取一个最小可用子集。htdt 那张表只有
`Name / Description / Size / Path / Cost` 五列，其中关键是 **in-game Size**，且按资产类型切换单位
（3D 用米、贴图用 tile 尺寸、背景用像素+行为词、精灵用显示像素）。

值得单独强调的原则：**它记的是意图尺度，不是文件尺寸**——文件像素引擎自己能读，「这张图该显示成多大」
读不出来。其立论理由是原文那句「没有它，coders consistently scale assets wrong」。

- [ ] 若 §3 的完整 manifest 一时排不上，先只加「用途 + 意图显示尺寸」两列，成本极低且立刻能防导入比例错误。

### 8.6 补充「不吸收」：一条看起来很有说服力的负面经验

htdt 删除全部流水线与门禁的理由，CHANGELOG 写得很直白：`removing guidance the current model no longer
needs`；更早一条是删掉外部验证环节，理由 `external pass added no signal`。

这个推理**在它的语境里成立**——产物是一次性游戏仓库，错了重跑一次即可。搬到本仓**完全不成立**：本仓门禁
存在的理由从来不是「模型不会」，而是「多人多次改动之后不能静默破坏契约」。§1 结论 3（避免僵化阶段管线）
本身没问题，但容易被顺读成「门禁也可以少点」。

- [ ] 在 §4「不吸收的内容」中显式补一条：⛔ 不引用「模型已经会了」作为削减任何既有门禁的理由；
  门禁的裁撤只能以「该不变量已被另一条更强的机检覆盖」为由。

### 8.7 反向证据：两个仓库为本仓铁律 2 提供了实证

liangdabiao 自己交付的样例游戏 `journey-runner`，**clone 下来渲染不出它自己 PLAN.md 里那张图**：
`scenes/main.tscn` 的三个 `Sprite2D` 没有任何 `texture =` 赋值，`scripts/player.gd` 引用
`res://assets/img/test_fox_run.png`，而 `assets` 在 `.gitignore` 里；同时 1.37 MB 的 AI 概念图
`reference.png` **入库了**。愿望入库、事实丢弃。

两家写进目标仓库的 ignore 列表还都包含 `*.import`——那正是 Cocos `.meta` 的对应物，忽略它等于放弃资源身份
的版本化。§4 第 4 条的判断因此得到实证支持，可保持不变；边界应写成「运行时真源资产 + `.meta` 入库，
只忽略缓存与证据副本」，**不能反过来**。

### 8.8 两个仓库的工程负债（仅备案，不吸收）

避免后续有人从这两个仓库直接取用脚本或流程：

- 资产工具的 Python 依赖八个包零版本约束；提议加下界的 PR **被维护者关闭未合并**。
- `setup.md` 的 macOS symlink 步骤被 issue 报告「会让每次 headless 调用永久挂起」，报告后仍是文档首选路径。
- 两个 `publish.sh` 的 `--force` 分支都对用户传入的任意目录执行 `rm -rf`。
- liangdabiao 用 `git clone` Godot **master** 生成 API 文档，却把引擎二进制钉在具体版本路径——文档与引擎
  按构造必然漂移。这恰好反证 §3「API 资料必须绑定锁定版本」的必要性。

### 8.9 观察项：`plan.md` 的考古层问题（不排期）

htdt `AGENTS.md` 的第三条编辑规则是：改动或删除特性时**直接描述新状态**，不要写「现在改成了 X（原来是
Y）」，以免文档变成考古层。

本仓 `plan.md` 已累积多轮复核记录与「原审阅证据（已收口）」分层，新读者需要穿过全部轮次才能取到当前事实。
但本仓的审计轨迹在多方复核场景下有真实价值（能回答「这个结论是谁在哪个基线上验的」），**不建议照办**。
若将来确实影响可读性，折中是把轮次记录移入独立的历史文件，`plan.md` 只保留当前状态。此处仅登记该张力，
当前不动。

### 8.10 与 §5 执行顺序的分歧

建议调整为：

```text
1. 产物往返自检（§8.3，新增 P1，不依赖真引擎，成本最低）
   → 2. verify:creator 最小路径（§3 P1，含 §8.4 三条机制）
   → 3. 资产 manifest 的「意图尺度」最小子集（§8.5）→ 再扩到 §3 完整字段
   → 4. Underground Idle 最小垂直切片 → 5. codegen:gameplay 泛化
   → 6. 付费资产任务器（有真实需求再做）
```

与 §5 的两处差异：**往返自检提到最前**（它不需要真引擎、能立刻补上一类全新的门禁维度）；
**资产 manifest 拆成两步**（先落「意图尺度」，避免完整字段表拖住整条链）。

### 8.11 追加外部证据

- htdt 提交 `9ac4d84`「Docs-only runtime」：87 文件、+458 / −8,401（commit stats）
- htdt `AGENTS.md`（1216 字节，`CLAUDE.md` 为其 symlink）的 Editing Rules 三条
- htdt `prompts/runtime.md`（1127 字节）：`Judge progress from the running game, never from a clean build`
- htdt `engines/godot.md` 的 `Quirks worth knowing (silent-failure)` 与 `PackAndSave` 往返自检
- htdt `engines/babylon.md` 的 ready-flag 与 WebGL `RENDERER` 软件渲染检测
- htdt `asset-gen/SKILL.md` 的 `Asset manifest (in README.md)` 与 in-game Size 单位约定
- liangdabiao `journey-runner/scenes/build_*.gd` 的 `validate_packed_scene`
- liangdabiao `.claude/skills/godot-api/SKILL.md` 的三步索引降级与 `context: fork` 隔离

本轮同样只读研究，除本文件外未修改任何文件。
