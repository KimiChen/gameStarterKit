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
