# 提案：bitECS 锁定副本提升至 vendor/bitecs 并接入双端同步链

> 状态：**提案（待维护方评审）**。本文回答三件事：为什么提、怎么做（文件级步骤与验证矩阵影响）、
> 以及随本提案一起落地的 warren 玩法将如何消费它。所有对现有机制的改动均以"显式框架侵入"
> 口径声明（Non-intrusive §12.3），接受即应同批更新 protected-paths 规则与 inventory 登记。

## 1. 背景与动机

新玩法 `warren`（竖版动作肉鸽，服务端权威 + 客户端预测，规划见随附 docs）需要把
**同一套 bitECS 战斗世界**跑在三处：

| 运行端 | 角色 | 现状是否可达 |
| --- | --- | --- |
| `apps/server`（Colyseus 房间） | 结算权威（20Hz tick 跑世界） | ✗ 不可达 |
| `apps/shared`（双端单源契约） | 战斗世界源码真相（无头 TDD） | ✗ 不可达 |
| `apps/client` / Cocos 镜像 | 预测与表现 | ✓ 现状唯一可达端 |

**阻塞点**：bitecs 12 个锁定文件位于 `apps/client/src/lib/bitecs/`，属于客户端真源树。
`apps/shared` 的约束（tsconfig `include: ["src"]` 自包含、独立 `tsc --noEmit`、
镜像链禁反向依赖）使 shared **物理上无法**引用 client 树内模块；server 侧同样没有合规
import 路径。若维持现状，warren 只有两条劣路：把战斗世界写在 client（放弃服务端权威）、
或在 server 复制一份 bitecs（放弃字节锁单源）。

## 2. 备选方案与取舍

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| A. **提升至 `vendor/bitecs/` + 镜像进消费树**（本提案） | ✅ 采用 | 单一字节真源；完全复用既有"生成镜像"机制（precedent：`apps/client/src/shared`）；不改锁定内容一个字节 |
| B. tsconfig paths 别名指向 client 副本 | ✗ 否决 | 依赖方向反转（shared→client）；paths 不解决 node/tsx 运行时解析；跨工作区路径债 |
| C. 改用 npm bitecs | ✗ 否决 | dist 含 ES2020 语法，违反 ES2017 下限铁律 4（老 JSCore 会崩；见 `lib/bitecs/README.md` 原文）；且与锁定副本形成双源漂移 |
| D. 在 `apps/shared/src` 内再放一份锁定副本 | ✗ 否决 | 双份字节真源，锁基线与升级流程分裂 |

## 3. 推荐方案：目录结构与数据流

```text
vendor/bitecs/                      ★ 唯一字节真源（12 文件 + LICENSE + README，git mv 保历史）
  ├── Component.ts … Query.ts（12 个锁定文件，内容零改动）
  ├── LICENSE（MPL-2.0，随行）
  └── README.md（更新"来源"一节指明新真源位置与升级流程）

apps/shared/src/vendor/bitecs/      生成镜像①（禁手改，孤儿/漂移并入 verify:sync 机检）
  └── 由 sync 步骤从 vendor/bitecs 字节拷贝
      → 随既有 shared 链自动流动：apps/client/src/shared/vendor/bitecs → apps/Cocos/assets/src/shared/vendor/bitecs

apps/server/src/…                   服务端经 @game/shared 工作区依赖解析 apps/shared/src 内
                                    sim 代码的相对 import（tsx 直跑 TS，零新机制）

apps/client/src/logic/rooms/ballMove/  既有消费方：import 改指 shared 镜像路径后，
                                       删除 apps/client/src/lib/bitecs 旧位置（见 §4 步骤 6）
```

**关键性质**：镜像①落在 shared 真源树**内部**，因此 shared 内 sim 代码对 bitecs 的相对
import 在三级镜像（shared → client → Cocos）中路径深度始终成立，**无需任何 import 改写**；
client/Cocos 侧继续走既有 SystemJS 兼容字节（Relation.ts 的 `./index` 改写等偏差保持原样）。

## 4. 实施步骤（文件级清单）

| # | 改动 | 文件 | 说明 |
| --- | --- | --- | --- |
| 1 | git mv | `apps/client/src/lib/bitecs` → `vendor/bitecs` | 保历史；**12 个锁定文件字节零改动** |
| 2 | 同步链扩展 | `scripts/sync-shared.mjs`（或新增 `sync:vendor-bitecs` 并入 `sync` 聚合） | 把 `vendor/bitecs` 拷入 `apps/shared/src/vendor/bitecs`；纳入漂移/孤儿/大批删除熔断；镜像目录登记为禁手改生成区 |
| 3 | 锁校验升级 | `scripts/verify-ecs.mjs` | BASE 改指 `vendor/bitecs`；新增**副本一致性校验**：canonical 与 shared 镜像、Cocos 镜像逐文件哈希相等（precedent：vendor-lock 对 colyseus 双副本的同版双守） |
| 4 | 初始化登记 | `scripts/init-project.mjs` | bitecs 条目 paths 更新为新真源 + 镜像路径 |
| 5 | EOL 域 | `.gitattributes` | 机检域 eol=lf 模式覆盖 `vendor/bitecs` 与新镜像路径（哈希稳定前提） |
| 6 | 旧位置迁移 | `apps/client/src/logic/rooms/ballMove/GameECS.ts`、`GameSystems.ts` | import 从 `../../../lib/bitecs/index` 改指 shared 镜像相对路径；随后删除 `apps/client/src/lib/bitecs`（如维护方希望分批，可保留一个版本的过渡副本并双写） |
| 7 | 文档与登记 | `docs/CLIENT.md`、`docs/OVERVIEW.md` §2 表、`docs/inventory.json`、`scripts/verify-inventory.mjs` 断言文案、`apps/client/src/lib/bitecs/README.md`（随迁并更新） | 所有"`apps/client/src/lib/bitecs/`"表述改为新真源；新增提案文档登记 |
| 8 | protected-paths | `scripts/protected-paths.json` + `docs/Non-intrusive.md` §11.3 散文视图 | 本变更属显式框架侵入：`vendor/bitecs/**` 与 `apps/shared/src/vendor/**` 列入保护路径；两视图同批更新（矩阵测试双向 deepEqual） |

**上游升级流程**（对应原"维护团队手动更新"）：改为在 `vendor/bitecs` 应用上游补丁 →
重算 `scripts/bitecs.sha256` → 跑 `sync` 聚合刷新全部镜像 → `verify:ecs`（含副本一致性）、
`verify:sync`、`verify:vendor` 全绿。流程比现状多一步"镜像刷新"，其余不变。

## 5. 验证矩阵影响

| 命令 | 影响 |
| --- | --- |
| `verify:ecs` | 改造（BASE 重定向 + 副本一致性新增校验项） |
| `verify:sync` | 改造（新镜像纳入漂移/孤儿/熔断） |
| `verify:protected-paths` | 改造（新增两条保护路径 + §11.3 同批） |
| `verify:inventory` | 改造（bitecs 表述断言文案） |
| `verify:vendor` | 不变（可选项：将 `vendor/bitecs` 一并纳入 LOCKED_FILES 由维护方定夺——与 verify:ecs 双锁不冲突，参照 colyseus 双守先例） |
| `typecheck` 全链 / `test:sync-mirror-matrix` 等 | 预期绿；镜像矩阵测试如断言目录集合需同步增员 |

## 6. warren 玩法消费视图（随本提案落地的目录结构）

```text
apps/shared/src/gameplays/warren/
├── wire.ts                  # C2S(移动意图/攻击/冲刺/格挡 + rateCost/phases) S2C(伤害/前摇/状态)
├── sim/                     # 战斗世界（纯 TS 无头，import '../..../vendor/bitecs/index'）
│   ├── world.ts             # createWorld + 系统清单 manifest（顺序 = 管线语义）
│   ├── comps/               # 组件定义（热属性 typed 字段）
│   ├── systems/             # 20 步伤害管线系统 + 扩展槽 + 帧末 Cleanup
│   ├── stats.ts             # eid→Float64Array 侧表 StatStore（长尾属性）
│   ├── status.ts            # "ID/数值" 状态实体工厂
│   └── formulas.ts          # 对数曲线/处决/下限
├── constants.ts             # 机制常数（自创数值）
└── config/                  # Excel→codegen：武器/开火数据/状态定义

apps/server/src/…            # WarrenRoom：20Hz tick 跑 sim（移动客户端权威 + 伤害服务端权威）
apps/client/src/logic/rooms/warren/   # WarrenECS 包装（Colyseus 状态↔实体同步，参照 ballMove）
apps/client/src/view/rooms/warren/    # 视图只读 ECS
features/warren/feature.json + docs/warren/（研究文档迁入并登记）
```

## 7. 风险与边界

1. **MPL-2.0**：文件级 copyleft——本方案**不改锁定字节**，仅移动位置并随行 LICENSE/版权头，
   许可合规性与现状完全一致。
2. **SystemJS/Cocos**：消费字节与现状完全相同（含既有两处偏差），唯一变化是文件所处目录；
   镜像相对路径深度已在方案内论证。
3. **迁移窗口**：步骤 1-2 与步骤 6 需同批提交（否则 ballMove import 断链）；建议单 PR、
   全量验证矩阵绿后合入。
4. **回滚**：单提交 revert 即可完整回退（git mv 保历史，镜像删除由 sync 熔断保护）。

## 8. 验收标准

- [ ] `vendor/bitecs` 为唯一手写真源；`apps/shared/src/vendor/bitecs` 与 Cocos 镜像为生成物且哈希一致
- [ ] `apps/client/src/lib/bitecs` 已删除，ballMove 编译运行不回归
- [ ] `verify:ecs / verify:sync / verify:vendor / verify:protected-paths / verify:inventory / typecheck 全链` 绿
- [ ] server 侧演示：`apps/server` 内 import shared sim 代码（含 bitecs world 创建）通过 tsx 无头运行
- [ ] 文档、protected-paths 双视图、inventory 登记同批更新

---
*随附材料：docs/warren/（玩法研究与技术文档，合入时一并登记）。*
