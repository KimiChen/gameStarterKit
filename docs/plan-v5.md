# gono 当前开发收口计划（plan-v5）

> **本文件是当前实施状态、验收基线与开放项去向的唯一真相**（`docs/inventory.json` 的
> `routeOfTruth.corePlan` 指向本文件）。
>
> - **仍未实现的开放项**登记在 [docs/EXTRAS.md §5.2](EXTRAS.md#52-未实现的开放项登记2026-09-06-自-plan-系列归并)；
> - **有意保留的边界**（⛔ 不是待办）登记在 [docs/EXTRAS.md §5.3](EXTRAS.md#53-有意保留的边界登记备查-不是待办)；
> - 专项的阶段状态各有其唯一真相，本文件 ⛔ 不复制：Snake 见
>   [apps/plugins/snake/README.md](../apps/plugins/snake/README.md)，插件分享平台见
>   [docs/PLUGIN-REGISTRY.md](PLUGIN-REGISTRY.md) §7，kit 地基层见 [docs/KIT.md](KIT.md) §9。
>
> 历史归档链（`plan.md` / `plan-v2.md` / `plan-v3.md` / `plan-v4.md`）已于 2026-09-06 **从工作树删除**，
> 正文只在 Git 历史里（`git show 5940c85:plan-v3.md`，其余同理）。归并时已逐条回代码核验，没有任何
> 未被承接的开放项——⛔ 不要从任何归档的完成标记推导当前状态，需要考据时才去翻历史。

## 当前验证基线

判定方式是 `npm run verify:all` exit 0；`test:int` 另需本地 Redis/MySQL 实跑，⛔ 不进 `verify:all`。

> ⛔ **本节不钉具体测试数字**（2026-09-06 起）。最近一次记录在案的全绿是 feature → plugin 正名那轮
> （客户端 437/437、服务端 609/609，`e9b0be0`），其后 kit K0 批次仍在落地，那组数字随时会过期。
> 逐轮的数字与证据留在提交信息和各专项文档里；判断「现在是不是绿的」只有一个办法——自己跑一次。
> 此前本节累积了十条带日期的历史快照，正是让读者从过期数字推导当前状态的来源，已一并删除。

## 2026-09-06 归并

本文件此前的 A/B/C/D/E 五张表已按「实现状态」拆开：

| 原表 | 去向 |
| --- | --- |
| A 可排期工程项（2 条） | 仍未实现 → EXTRAS §5.2 G1/G2（两条早已在 EXTRAS §3.10 登记，此前是重复登记） |
| B 编辑器 / Creator 待办（6 条） | 5 条仍未实现 → EXTRAS §5.2 U1–U5；B5「合成 `.meta` 的 Creator 确认」2026-09-05 已闭合（Creator 3.8.8 未重写任何合成 `.meta`，证据在 [docs/evidence/creator-2026-09-05/](evidence/creator-2026-09-05/README.md)），保留为「下次 Creator 版本升级时复核」 |
| C 玩法实现（3 条） | C1 snake → 专项文档；C2 undergroundIdle → EXTRAS §5.2 P1；C3 真机联调 → EXTRAS §5.2 R1（**口径已澄清**：此前各处「真机验证」实为 Creator 桌面预览，物理设备联调从未做过） |
| D 有意保留边界（10 条） | → EXTRAS §5.3（其中「`src=` 悬空 resId 无闸」已过期删除，`GameRoom.ts` 行数改为不再逐轮重钉） |
| E 插件机制（6 条） | E1–E4 仍未实现 → EXTRAS §5.2 X1–X4；E5（两种形态的真实插件端到端实证）与 E6（`install --reinstall-from-tree`）已完成，证据是各自的契约测试与 Creator 证据目录 |

归并前对四个历史归档做过逐条回代码核验：**没有任何未被承接的开放项**。两处措辞同时更正——
plan-v2 / plan-v3 §6 的两条不是「闭合」而是**移交出计划链**（T1–T7 交 [todo-godogen.md](../todo-godogen.md)、
产物往返自检交 EXTRAS §3.10）；plan-v3 的待补齐是它**自己那一轮**闭合的，plan-v4 只是从 78 条保留边界里
挑了 5 条留白。

## 已闭合（不再追踪，证据在归档）

- plan-v4 承接的 5 条产品/工程留白已全部实施完毕；Non-intrusive 框架侧阶段 0–9 已实施（证据表在已删除的历史归档
  `plan-v4.md`「Non-intrusive 阶段 0–9 实施证据」一节，见 Git 历史）；drop-in 房型框架已实施。
- 历史计划链的开放项：plan.md / plan-v2.md 经 plan-v3 闭合或移交，plan-v3 正文 34 条 `[已完成]`、
  0 条待补齐；plan-v4「仍然开放」8 条与「遗留待办」5 条已全部被本文件承接，再由本轮归并转入 EXTRAS §5.2/§5.3。
