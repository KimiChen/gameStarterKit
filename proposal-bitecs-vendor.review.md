# 评审意见：proposal-bitecs-vendor.md

> 状态：**评审意见（未合入结论）**。评审对象 = 仓库根 [proposal-bitecs-vendor.md](proposal-bitecs-vendor.md)
> 及其随附材料 [docs/warren/](docs/warren/)。评审日期 2026-09-05，基线 commit `9117ae4`（工作区干净）。
>
> 本文只回答一件事：**这份提案现在能不能合入，不能的话缺什么**。所有结论都带 `file:line` 证据，
> 附录 A 列出本次实际跑过的验证命令与输出——凡是「必红 / 不成立」这类强断言，都是跑出来的，不是推的。

## 0. 结论摘要

**方向对，文档不能按现状合入。**

把 bitECS 字节锁真源从客户端真源树提到中立位置，是正确的架构判断，替代方案 B/C/D 的否决理由也基本站得住。
但这份提案存在三类问题：

| 类别 | 数量 | 性质 |
| --- | --- | --- |
| **阻塞项** | 5 组 | 按 §4 步骤表原样执行，`npm run verify:core` 会在五处红；§5「预期绿」是错的 |
| **论证问题** | 3 条 | §1 的动机表、§2 否决 C 的理由、§8 的第 4 条验收标准，都经不起一条命令的复核 |
| **决策级问题** | 4 条 | 不是执行漏洞，是提案需要重新回答、并显式落笔的判断 |

外加一条提案与 warren 文档都没看到的技术前提（第 3 节），会让 warren 的「服务端权威」
在第二个房间开局时直接算错伤害。

---

## 1. 阻塞项：按提案原样执行，`verify:core` 会在五处红

### 1.1 Cocos 镜像换路径 → 缺 17 个 `.meta`，`verify:sync` 必红

[scripts/sync-client.mjs:291](scripts/sync-client.mjs) 对 `git ls-files` 已跟踪的每个非 `.meta` 文件断言
`<file>.meta` 在库，[:295](scripts/sync-client.mjs) 对每级已跟踪目录同样要求目录 `.meta`：

```js
for (const rel of tracked) {
    if (rel.endsWith(".meta")) continue;
    if (!trackedSet.has(rel + ".meta")) problems.push(`缺 .meta：${rel}（开一次 Creator 生成后连同提交…）`);
}
for (const dir of trackedDirs) {
    if (!trackedSet.has(dir + ".meta")) problems.push(`缺目录 .meta：${dir}/（开一次 Creator 生成后连同提交）`);
}
```

按 §4 步骤 1+2+6 做完再跑 sync：旧镜像 `apps/Cocos/assets/src/lib/bitecs/**`（30 个入库条目，
含 14 个文件 `.meta` + `utils.meta` + `bitecs.meta`）被判孤儿删除；新镜像
`apps/Cocos/assets/src/shared/vendor/bitecs/**` 只落 14 个源文件——**sync 脚本不生成 `.meta`**。
一旦 `git add`，`sync-client --check` 立刻给出 14 条「缺 .meta」+ 3 条「缺目录 .meta」
（`shared/vendor`、`shared/vendor/bitecs`、`shared/vendor/bitecs/utils`），
`verify:sync` → `typecheck` → `verify:core` 全链红。

**提案 §4 的八个步骤与 §8 的验收标准里没有一个字提 `.meta`。**

> ✅ 好消息：这批 uuid 在 `apps/Cocos/assets` 下引用数为 0（bitECS 不是 `cc.Component`，
> scene/prefab 不引用它），所以 uuid 重铸不会断引用。
>
> ✅ 便宜解法（提案未想到）：把旧的 16 个 `.meta`（14 文件 + `utils.meta` + `bitecs.meta`）
> 直接 `git mv` 到新路径对应位置——`sync-client` 只删「逻辑文件已消失」的孤儿 `.meta`，
> 手工摆放的 `.meta` 会被原样保留，uuid 不变、**不需要开 Cocos Creator**。
> 只剩 `shared/vendor.meta` 一个新目录 meta 需要补。
>
> ⚠ 若不走 `git mv` 路线，则必须在步骤里写明「本步骤须由装有 Cocos Creator 的人执行」——
> 参照 commit `245d363`「Creator 是 `.meta` 的权威写者」的口径。

**修改要求**：§4 步骤 1 明确写出 Cocos 镜像 `.meta` 的处置方式（推荐 `git mv` 路线并列出 17 个落点）；
§8 验收补一条「新镜像 `.meta` 齐全，`verify:sync` 绿」。

### 1.2 `verify:project` 与 `test:client` 必红；§4 步骤 4 指错了文件

bitecs 的 paths **真源是 [project.metadata.json:37-40](project.metadata.json)**：

```json
"paths": [
  "apps/client/src/lib/bitecs",
  "apps/Cocos/assets/src/lib/bitecs"
]
```

[scripts/verify-project-metadata.mjs:417](scripts/verify-project-metadata.mjs) 对每条 paths 做 `lstatSync`，
缺失即 `errors.push("第三方产物缺失：" + relative)`；该函数由 `verifyProjectMetadata` 无条件调用。

**提案 §4 步骤 4 只写了 `scripts/init-project.mjs`，那是错的落点**：
[scripts/init-project.mjs:318](scripts/init-project.mjs) 是
`Array.isArray(existing?.thirdParty) ? existing.thirdParty : DEFAULT_THIRD_PARTY`——
已入库的 `project.metadata.json` 里有 `thirdParty`，`DEFAULT_THIRD_PARTY`（[:54](scripts/init-project.mjs)）
**永不生效**，即使显式跑 `npm run init:project` 也原样保留旧 paths。

两个分支都红（附录 A.2 实跑）：

- 不改 metadata + 执行步骤 6 → `第三方产物缺失：apps/client/src/lib/bitecs` / `…/apps/Cocos/assets/src/lib/bitecs`
- 改了 metadata 但不改测试夹具 → [apps/client/test/projectMetadata.test.ts:50-54](apps/client/test/projectMetadata.test.ts)
  硬编码 fixture 目录清单，[:118](apps/client/test/projectMetadata.test.ts) 的
  `assert.equal(baseline.ok, true)` 直接失败 ⇒ `test:client` 红

[package.json:50](package.json) 的 `verify:core` 第二条命令就是 `npm run verify:project`，
最后一条是 `npm run test:client`。

**修改要求**：§4 新增独立一行「改 `project.metadata.json` 的 `thirdParty[bitecs].paths`」
（至少含 `vendor/bitecs`，镜像项按 sync 链实际落盘目录取舍）；同批改
`apps/client/test/projectMetadata.test.ts:50-54` 的 fixture 目录清单与
`scripts/init-project.mjs:54` 的默认值（后者只影响新项目初始化，不代偿前两条）；
§5 矩阵与 §8 验收补 `verify:project`、`test:client` 两行。

### 1.3 `verify:inventory` 必红：铁律 1 是三方字面锁

[scripts/verify-inventory.mjs:717](scripts/verify-inventory.mjs)：

```js
["bitECS 锁定目录", "`apps/client/src/lib/bitecs/` 的 12 个 TypeScript 文件禁改"],
```

[:738-740](scripts/verify-inventory.mjs) 逐条断言该串出现在 AGENTS.md **或** CLAUDE.md，
[:700-703](scripts/verify-inventory.mjs) 又要求两文件「除空白外必须保持一致」
（实测 `diff AGENTS.md CLAUDE.md` 当前为空）。

**§4 步骤 7 只列了 checker 侧（`scripts/verify-inventory.mjs` 断言文案），没列被 check 的
[CLAUDE.md:113](CLAUDE.md) 与 [AGENTS.md:113](AGENTS.md) 铁律 1 原文。**
照做就是改了 checker、没改文档 ⇒ `verify:inventory` fail「缺少共同关键指令：bitECS 锁定目录」；
反过来只改文档不改脚本同样红；只改一份文档也红。

同批还要改的：

- [CLAUDE.md:109](CLAUDE.md) / [AGENTS.md:109](AGENTS.md) 的 bitECS 升级流程段落（要加「跑 sync 刷新镜像」一步）
- CLAUDE.md / AGENTS.md **铁律 2 的生成镜像清单**要新增 `apps/shared/src/vendor/bitecs/` 一条——
  [verify-inventory.mjs:719](scripts/verify-inventory.mjs) 的注释明写「铁律 2 的生成物清单必须完整：
  只校验标题在场会让新增生成物静默漏登记」，提案宣布该目录是「禁手改生成区」却不登记，正是这个漏法

**修改要求**：步骤 7 补 `CLAUDE.md` 与 `AGENTS.md`，注明三处必须**同批同字面**修改，
且改完 `diff AGENTS.md CLAUDE.md` 仍须为空。

### 1.4 `verify:protected-paths` 桶位错配 + 漏了 `protected-paths.lock`

[scripts/protected-paths-lock.mjs:10-11](scripts/protected-paths-lock.mjs) 明写：

> 锁的范围 = `featureFlow.paths` ∪ `gameplayFlow.paths` 里的**手写**文件（glob 条目展开到目录下每个文件）。
> ⛔ 刻意不锁 `generatedWriterOwned`：那些是生成物/镜像/锁，各自已有 writer 闸与新鲜度检查……

§4 步骤 8 有三处硬伤：

1. **漏了 `scripts/protected-paths.lock`**。只要 `vendor/bitecs/**` 进 `featureFlow.paths`，
   12 个 `.ts` 会被展开进 `.lock`；不跑 `node scripts/protected-paths-lock.mjs --write` 重钉，
   `verify:protected-paths --check` 直接红。提案全文没提这个文件。
2. **桶位错**。`apps/shared/src/vendor/**` 按提案自己的定性（步骤 2 原话「镜像目录登记为禁手改生成区」）
   属 `generatedWriterOwned`，不属「普通 feature 动线中不应再修改」的 `featureFlow`。
   放错桶 = 生成物被字节锁，每次 sync 刷新都要重钉，与上面那条设计注释正面冲突。
3. **「两视图 deepEqual」对生成物桶不成立**。`featureFlow`/`gameplayFlow` 各有散文视图
   （[protected-paths.json:14-58](scripts/protected-paths.json) 的 §11.3 / §12.2），
   而 `generatedWriterOwned` **没有**散文视图。该桶条目必须给 `writer` 与 `autoHeader`，
   提案两个字段都没定；且 `autoHeader` **只能是 `false`**——铁律 1 禁止给这 12 个字节锁文件加
   `Do not edit` 抬头，写 `true` 会让
   [apps/client/test/protectedPaths.test.ts:160-166](apps/client/test/protectedPaths.test.ts) 逐文件断言失败。

**修改要求**：步骤 8 拆成两条并写明桶位——

- `vendor/bitecs/**`：手写字节锁真源，现有三桶都不合身。建议**不塞进 featureFlow**
  （避免与 `verify:ecs` 双锁重复且引入 `.lock` 维护成本），改为在 `protected-paths.json` 的
  `semantics` 加注、明确由 `verify:ecs` 单独守。
- `apps/shared/src/vendor/**`：登进 `generatedWriterOwned.entries`，
  `"writer": "npm run sync:shared"`、`"autoHeader": false`。
  （下游 `apps/client/src/shared/**` 与 `apps/Cocos/assets/src/**` 已有条目覆盖，无需增员。）
- 若最终仍有条目进 featureFlow/gameplayFlow，必须补 `node scripts/protected-paths-lock.mjs --write` 重钉。

### 1.5 `verify:sync` 的组成被 `verify-toolchain.mjs` 钉死，且它是 `verify:core` 的第一条命令

[scripts/verify-toolchain.mjs:26-29](scripts/verify-toolchain.mjs)：

```js
export const VERIFY_SYNC_COMMANDS = [
  "node scripts/sync-shared.mjs --check",
  "node scripts/sync-client.mjs --check",
];
```

[:405-408](scripts/verify-toolchain.mjs) 按 `&&` 切分做集合 + 顺序比对，不符即 exit 1；
[scripts/aggregate-chain-matrix.test.mjs:31-43](scripts/aggregate-chain-matrix.test.mjs)
再从该文件正则读出这几张表与真实 npm 执行序列 `deepEqual`。
`verify:core` 的**第一条**命令就是 `node scripts/verify-toolchain.mjs`——不同批改这张表，
后面所有验收项根本跑不到。

**§5 只写了「`verify:sync` 改造」，完全没提 `verify-toolchain.mjs` 这个第二真源。**

**额外注意**：§4 步骤 2 的括号里留了个备选「或新增 `sync:vendor-bitecs` 并入 `sync` 聚合」。
若走这个分支，[verify-inventory.mjs:704-706](scripts/verify-inventory.mjs) 的 `checkRootCommandTable`
会要求根 package.json 每个 script 都出现在 README.md / CLAUDE.md / AGENTS.md 三份命令表里
（双向比对，`missing` 与 `stale` 都报错），而 [docs/inventory.json:176-243](docs/inventory.json) 的
`workspaceCommandScope` **只豁免 workspace 脚本，根脚本没有任何豁免形态**。

建议在 §4 直接写死「只扩展 `scripts/sync-shared.mjs`，不新增根脚本」，并删掉那个括号备选。
（顺带：§4:61 与 §4:70 两处引用的 `sync` 聚合命令在 `package.json` 里**不存在**，
现有的是 `sync:shared`，它已串接 `sync-client`。）

---

## 2. 提案自身的论证问题

### 2.1 §1 的「不可达」表被证伪

§1 表格把 `apps/server` 与 `apps/shared` 都标成「✗ 不可达」，正文断言 shared 的
tsconfig `include: ["src"]` 使它「**物理上无法**」引用 client 树内模块、server 侧「同样没有合规 import 路径」。

两条都不成立（附录 A.3 实跑）：

- **`include` 不隔离目录树**：`include` 只决定「根文件集合」，被 import 的文件一律进 program 并被类型检查。
- **server 侧现在就能跑**：`cd apps/server && node --import tsx <probe>` 直接 import
  `apps/client/src/lib/bitecs/index`，`createWorld/addEntity/addComponent/createRelation` 全部通过。
  仓库自己就在这么干——[package.json:45](package.json) 的
  `"test:client": "cd apps/server && node --import tsx --test ../client/test/*.test.ts …"`。

**真正成立的阻塞是另外两条，提案只在括号里一笔带过**：

1. **铁律 2 的镜像方向**：`apps/shared/src` 会被整份复制成 `apps/client/src/shared` 再进 Cocos
   （[sync-shared.mjs:27-28](scripts/sync-shared.mjs) 的 `SRC`/`DEST` 只搬 `src` 内的东西），
   任何逃出 `apps/shared/src` 的相对路径在两级镜像里必然断链——typecheck 能过，sync 到 Cocos 后运行时才断。
2. **`apps/client` 不是 workspace**（[package.json:6-8](package.json) 只有 `apps/shared`、`apps/server`），
   server 相对 import 进 client 树是**架构违规**而非解析失败。

**修改要求**：§1 把「物理上无法 / 没有合规 import 路径」换成上面两条；表格里 server 那行
「✗ 不可达」改为「✗ 不合规（技术可达）」。留一个能被一条命令推翻的断言，会让评审对整份提案的
可信度打折，也会把「include 能隔离目录树」这个错误不变量吸收进仓库文档——本仓恰恰是靠机检
消灭这类口口相传的假不变量的。

### 2.2 §2 否决方案 C 的理由自相矛盾

§2 否决 npm bitecs 的第一理由是「dist 含 ES2020 语法，违反 ES2017 下限铁律 4（老 JSCore 会崩）」。

但被推荐保留的这份 vendored 副本，在 [Relation.ts:280](apps/client/src/lib/bitecs/Relation.ts)
`export const Wildcard = getWildcard()` 是**模块顶层求值**，
而 [:266-274](apps/client/src/lib/bitecs/Relation.ts) 的 `getWildcard()` 直接读写
`(globalThis as any)[Symbol.for('bitecs-global-wildcard')]`——`globalThis` 是 ES2020 全局，
**降阶只转语法、不补 polyfill**。[:309](apps/client/src/lib/bitecs/Relation.ts) 的 `IsA` 同理。

实测（附录 A.4）：`lib: ["ES2017"]` 闸对 `globalThis` **零错误**，只拦
`Object.fromEntries` 那一类——这正是 [apps/client/tsconfig.json:15](apps/client/tsconfig.json)
注释点名的东西，`globalThis` 恰好不在闸内。

也就是说 §2 的 C 行理由（语法 vs 宿主全局 API）两边其实都拦不住，
而真正成立的否决理由在 [apps/client/src/lib/bitecs/README.md](apps/client/src/lib/bitecs/README.md)
的「与上游的偏差」一节里现成有：**Cocos SystemJS 对目录/自指导入的解析要求 + 字节锁单源**。

**修改要求**：§2 的 C 行换掉理由；§7 风险表新增一行显式登记这条既有破例
（`Relation.ts` 模块顶层访问 `globalThis`，`lib:["ES2017"]` 不拦、降阶不补 polyfill），
说明目标运行时下限是否覆盖它。这不影响「移到 vendor/」的结论，但不该让维护方基于一条
经不起复核的理由拍板，更不该把「ES2017 下限由 lib 闸守住」这个错误认知固化。

### 2.3 §8 第 4 条验收标准没有鉴别力

> - [ ] server 侧演示：`apps/server` 内 import shared sim 代码（含 bitecs world 创建）通过 tsx 无头运行

这条在**迁移前就已经满足**（见 2.1 的实测 B），迁移后同样满足
（[apps/shared/package.json:9-11](apps/shared/package.json) 的 `"./*": ["./src/*.ts", "./src/*"]`
已支持深路径，server 侧已有 `@game/shared/gameplays/snake/ruleset` 先例）。等于给迁移盖了一个空章。

**修改要求**：换成能区分迁移前后的判据，例如同时要求：
server 侧 import 说明符必须是 `@game/shared/gameplays/warren/sim/...`（不得出现任何
`apps/client/src/lib/bitecs` 相对路径）、全仓 `grep apps/client/src/lib/bitecs` 零命中、
且 `scripts/verify-ecs.mjs` 的 `BASE` 已指向 `vendor/bitecs`。

---

## 3. warren 前置技术问题：bitECS 的 eid 命名空间（提案与 warren 文档均未覆盖）

**bitECS 0.4 的组件数据不属于 world。**

- [World.ts:39-56](apps/client/src/lib/bitecs/World.ts) 的 `WorldContext` 只有
  `entityIndex / entityMasks / entityComponents / componentMap / queries`，**没有任何数据槽**；
  [Component.ts:23](apps/client/src/lib/bitecs/Component.ts) `export type ComponentRef = any`。
- 组件数据在**模块作用域**。仓内基准写法就是这样：
  [apps/client/src/logic/rooms/ballMove/GameComps.ts:9](apps/client/src/logic/rooms/ballMove/GameComps.ts)
  `export const PlayerModel = { … }`，注释自己写着「按 eid 索引的数组」。
- [EntityIndex.ts:116](apps/client/src/lib/bitecs/EntityIndex.ts) `const id = ++index.maxId`，
  而 [World.ts:41](apps/client/src/lib/bitecs/World.ts) `entityIndex || createEntityIndex()`
  ⇒ **每次 `createWorld()` 默认新建独立 index，两个 world 的第一个实体都是 eid=1**。

实跑复现（完整脚本见附录 A.5）：

```
默认 createWorld():   eidA=1 eidB=1  → Hp.v[eidA]=7 (期望 100)     ← 被另一个房间覆盖
  roomA query: [ 1 ]   roomB query: [ 1 ]
共享 EntityIndex:     eidC=1 eidD=2  → Hp.v[eidC]=100 (期望 100)   ← 正确
```

`query()` 是 per-world 的（各自 `componentMap`/`entityMasks`），所以 `query(roomA,[Health])`
只返回 roomA 的 eid，**看起来一切正常**；但系统拿到 eid 后读写的
`Health.hp[eid]` 是全进程唯一的一份数组。

对 warren 的直接后果：提案 §6 规划「WarrenRoom：20Hz tick 跑 sim」，
[MIGRATION_GAMESTARTERKIT.md](docs/warren/MIGRATION_GAMESTARTERKIT.md) §三 规划
`stats.ts` 用「eid→Float64Array 侧表 StatStore（模块管理）」、`comps/` 用组件 typed 字段、
§五.8 还在鼓励「查询在模块作用域 defineQuery 缓存」——三处全是模块作用域 store。
**第 2 个 warren 房间开局的瞬间，它的玩家/怪物/DamageEvent 实体就会写进第 1 个房间同 eid 的
血量、属性、状态槽**；一个房间 `removeEntity` 还会把另一个房间同 eid 的旧值留给对方复用。

这不是性能或洁癖问题，是**伤害结算权威直接算错**，而且单房间开发与单测全绿，只在双房间并发时才炸。
ballMove 没踩中，只是因为
[GameECS.ts:13-17](apps/client/src/logic/rooms/ballMove/GameECS.ts) 是客户端进程内的单例单 world。

Relation 侧同理：`Wildcard`/`IsA` 用 `globalThis[Symbol.for(...)]` 做进程单例，
[Relation.ts:81-89](apps/client/src/lib/bitecs/Relation.ts) 的 `data.pairsMap` 按 target 值缓存
pair 组件对象 ⇒ 房间 A 的 `IsA(1)` 与房间 B 的 `IsA(1)` 是同一个组件对象。

**修改要求**：在提案 §6 与 MIGRATION §五「ECS 风险清单」里把 eid 命名空间定成**显式设计决策**，二选一：

- **① 共享 EntityIndex（推荐，改动最小，已实测可行）**：进程内 `const sharedIndex = createEntityIndex()`
  单例，sim 的 world 工厂签名改成 `createWarrenWorld(index: EntityIndex)`，全部房间 `createWorld(index)`
  （[World.ts:74](apps/client/src/lib/bitecs/World.ts) 靠 `dense`/`sparse`/`aliveCount` 三字段识别该参数）。
  `removeEntity` 会把 id 还回共享池，数组上界是全进程并发实体峰值而非无限增长。
  代价：`StatStore` 的 `Float64Array` 必须按全局 eid 空间定长或可增长，不能按「单房间 N 个实体」算容量。
- **② store 进 world context**（`createWorld({stores})`），彻底隔离，但与 MIGRATION §三/§五.8 的
  模块作用域 StatStore + 模块作用域 defineQuery 缓存写法不兼容，等于重写 sim 的数据层约定。

无论选哪个，**M1 验收必须加一条「两个 world 并发跑同一 sim，互不串数据」的回归测试**，
否则这条不变量没有闸。

---

## 4. 决策级问题（需要显式落笔，机检不会帮你拦）

### 4.1 把 sim 放进 shared 是铁律 4 的正面破例

[CLAUDE.md:139](CLAUDE.md) / [AGENTS.md:139](AGENTS.md)：

> **shared 零依赖**：只使用 TypeScript 与 ES 标准库；禁 npm 包、Node API、`cc`、DOM
> 及**宿主环境全局对象**；禁 `const enum`；lib 钉 ES2017。

[docs/OVERVIEW.md:248](docs/OVERVIEW.md)「shared 不依赖 Node、DOM、引擎或宿主平台对象」；
[apps/shared/package.json:5](apps/shared/package.json)「双端共享的协议 / 常量 / 纯逻辑（零依赖，Cocos 编译器安全）」。

而 [Relation.ts:269-273](apps/client/src/lib/bitecs/Relation.ts) 读写 `globalThis`、
[SparseSet.ts:56](apps/client/src/lib/bitecs/utils/SparseSet.ts) 用 `SharedArrayBuffer`。

**这条破例不会被任何机检拦住**（实测见附录 A.1）：把 12 个文件放进与
[apps/shared/tsconfig.json](apps/shared/tsconfig.json) 逐项等价的探针工程
（`lib:["ES2017"]`、`types:[]`、继承 base+strict 并加
`exactOptionalPropertyTypes`/`noImplicitOverride`/`verbatimModuleSyntax`），
`tsc --noEmit` **退出码 0、零错误**——每个文件首行的 `// @ts-nocheck` 把
`TS1484`/`TS1205`/`noUnusedLocals` 一并压住了。`verify:inventory` 也只做字符串在场校验。

所以它只能靠人显式决策。量级不小：

| | 文件数 | 行数 |
| --- | --- | --- |
| `apps/shared/src` 现状 | 54 | 7 335 |
| 本提案先塞入的 bitECS | 12 | 2 396 |
| §6 紧接着要塞的 warren sim | world + comps + 20 个管线系统 + StatStore + status + formulas + config | 大概率超过 shared 现有全部内容 |

此后 warren 每改一行战斗逻辑都要走 `apps/shared/src` → `apps/client/src/shared` →
`apps/Cocos/assets/src` 三级镜像 + Creator 重导入 + `verify:sync`。
这已经不是「shared 承载协议/常量/纯公式」，而是 shared 变成主要代码宿主。

**必须二选一并在 §2 写明**：

- **(a) 接受破例** —— 同批修改 `CLAUDE.md:139` / `AGENTS.md:139` 铁律 4 与 `docs/OVERVIEW.md:248`，
  写明「vendor 镜像目录例外：字节锁定的第三方运行时可镜像进 `apps/shared/src/vendor/`，
  其宿主全局用法不视为违反」，并同批更新 `scripts/verify-inventory.mjs` 的断言文案
  （两份助手文档必须逐字一致）。
- **(b) 换方案**（把 sim 拆成独立 workspace 包，shared 保持纯契约）。

  ⚠ 但这个替代方案有**真实代价**，评审时别低估：跨包后源树与 client 镜像树的相对深度不一致
  （`../../shared/src` vs `../shared`），必然需要 import 改写，恰好破坏提案 §3 论证的
  「无需任何 import 改写」这条性质；而 [sync-shared.mjs:4-7](scripts/sync-shared.mjs) 明确
  镜像链不处理 node_modules / import map / 符号链接。所以 A 不是没有对手，但对手也不便宜。

- ⛔ **最坏的结果是保持现状**——让铁律 4 的文字与仓库实况不一致。

### 4.2 客户端会无条件全量携带服务端专用的 20 步伤害管线

提案 §6 自己写「移动客户端权威 + **伤害服务端权威**」，而
[sync-shared.mjs:27-28](scripts/sync-shared.mjs) 是整目录镜像、**无 include/exclude 机制**；
`apps/client/tsconfig.json` 与 `tsconfig.test.json` 的 `include` 都是 `src/**/*.ts`，
镜像内容全部进两条 typecheck。

微信小游戏包体、Cocos 每次重导入的资源量、两条 client typecheck 的耗时，都会按整套 sim 计。
§5 把这一栏写成「预期绿」，只回答了「会不会红」，没回答「代价多大」。

**修改要求**：§5 增一行「客户端包体 / 编译面」的影响评估；明确 warren 客户端到底需要 sim 的哪些部分
（若只需 movement/projectile/表现层，那本身就是选独立包方案的直接理由）。若坚持现方案，
至少在 §7 记一条「客户端携带服务端专用管线」的已知代价。

### 4.3 随附材料的版权面，提案 §7 零覆盖

§7「风险与边界」三条只谈 bitECS 的 MPL-2.0 / SystemJS / 迁移窗口。但随附材料的性质是另一回事：

- [docs/warren/COMBAT.md:3](docs/warren/COMBAT.md)「基于逆向源码（`src/`）与提取数据（`assets/Data/`）的
  完整还原。**行号引用基于本仓库反编译源码**」
- COMBAT.md 正文有 `src/Weapons/WeaponSimple.cs:873`、`src/Units/UnitAvatar.cs:2527` 这类精确定位，
  以及 `Const.json` 的逐键数值（`darkCloudDamagePercent=110%`、`goldHandLeaf=200/Max=20` 等）
- [MIGRATION_GAMESTARTERKIT.md](docs/warren/MIGRATION_GAMESTARTERKIT.md) §六 计划
  「**公式照抄**（`formulas.ts`）」「配置 Schema 参考 `assets/Data/*.json`」，
  §三 计划 `constants.ts # 机制常数（**原作 118 键的键名设计**，数值重调）`
- 而同一批材料的 [COMBAT_CLONE_PLAN.md:4](docs/warren/COMBAT_CLONE_PLAN.md) 写的是
  「原则：复刻架构，**不复刻代码/资产**（原作版权属 TEAM HORAY）」

**「公式照抄」与「不复刻代码」在同一批材料里互相矛盾**，评审据此无法判断实际会落什么进 `formulas.ts`。
`README.md:24-27` 还要求把 docs/warren 登记进 `docs/inventory.json` 与 `features/warren/feature.json`——
登记完就是仓库的正式参考真源。

CLAUDE.md 的「默认 git 是个私密 git」只影响**曝光概率**，不改变产物的派生属性；
而 COMBAT_CLONE_PLAN 规划的是可上线的竖版手游，一旦发布，私密性这层就消失了，
`formulas.ts`/`constants.ts` 会随包发出去。

**修改要求**：§7 加一条「随附材料的来源边界」，写成事实性表述：

- (a) 明确 docs/warren 属**内部研究底稿**，登记进 inventory 的 referenceDocs 而非 routeOfTruth；
- (b) 把「公式照抄」改成与 `COMBAT_CLONE_PLAN.md:4` 一致的口径——落进 `formulas.ts` 的是
  **曲线形态与管线顺序（机制）**，具体系数、阈值、键名重取；M1 验收加一条
  「`constants.ts` 无原作键名/原作数值」的对照检查；
- (c) 建议把 COMBAT.md 里 `文件:行号` 形式的反编译定位与逐键数值表在合入前降级为
  不带行号、不带原始键名/数值的机制描述，否则「反编译产物不进本仓」这句话在仓内是不成立的；
- (d) 若维护方决定保留原样，至少写明「本批材料是逆向派生物，仓库当前私密只降低曝光、不构成许可」，
  让接受这条风险成为一次显式决策。

**建议这一条单独拿出来评审，不要搭 bitecs 挪目录的车。**

### 4.4 `THIRD_PARTY_NOTICES.md` 的 MPL 归属声明未列入，且无机检兜底

[THIRD_PARTY_NOTICES.md:10](THIRD_PARTY_NOTICES.md) 的表格里，「入库位置」列是
`apps/client/src/lib/bitecs/`（含 LICENSE 原文）+ Cocos 镜像，并链向
`apps/client/src/lib/bitecs/README.md`。

**§4 步骤 7 没列这个文件，而且没有任何脚本会发现它过期**：
[verify-project-metadata.mjs:436-445](scripts/verify-project-metadata.mjs) 对 notice 文件只做
`package` / `license` / `version` 三个子串检查，**不检查 paths**；
`verify-inventory.mjs` 的 `checkMarkdownLinks` 只作用于 AGENTS.md 与 CLAUDE.md。

落地后：「入库位置」列指向已删除目录、表格里的 markdown 链接变死链，而且副本数从 **2 份**
（client 真源 + Cocos 镜像）变成 **4 份**（vendor 真源 + shared 镜像 + client 镜像 + Cocos 镜像），
声明表却仍只登记 2 处。**§7.1「许可合规性与现状完全一致」对「不改字节」成立，对「分发位置声明」不成立。**

**修改要求**：步骤 7 补 `THIRD_PARTY_NOTICES.md`——「入库位置」列改成 `vendor/bitecs/`（含 LICENSE 原文）
+ 三级镜像，死链改指 `vendor/bitecs/README.md`，「升级工具」列补上镜像刷新一步。
同时把 `LICENSE` 与 `README.md` 明确纳入步骤 1 的 `git mv` 范围（§3 目录图写了 LICENSE 随行，
但步骤 1 只说「12 个锁定文件」）。

---

## 5. 其余需要补的（已核实，不逐条展开）

| # | 问题 | 证据 |
| --- | --- | --- |
| 5.1 | §4 步骤 6 的「保留过渡副本并双写」会让 `apps/client/src/lib/bitecs` **完全脱离字节锁**——`BASE` 一改指 `vendor/bitecs`，[verify-ecs.mjs:22-28](scripts/verify-ecs.mjs) 的 `collectTs` 只递归单个 BASE，过渡副本既不在双向断言里也不在新增的三方哈希比对里，成为无人守的第 4 份 MPL 源码。正是方案 D 被否决的理由在过渡期复活。**建议直接删掉这个选项**；若保留，必须写明过渡期 `verify:ecs` 同时校验旧目录 + 给出删除截止提交 | [verify-ecs.mjs:13](scripts/verify-ecs.mjs)、§4:65、§2:31 |
| 5.2 | §7.4「镜像删除由 sync 熔断保护」**不成立**：本次 `removedLogical` = 16，低于 `BREAKER_MIN=20`，也低于 `ceil(180*0.3)=54`，sync 会静默执行。回滚安全性来自 `git revert` 恢复旧 `.meta`（uuid 不变），不是熔断。把不存在的防护写进风险评估会让评审偏乐观 | [scripts/lib/sync-breaker.mjs:16-28](scripts/lib/sync-breaker.mjs)、[sync-client.mjs:153-162](scripts/sync-client.mjs) |
| 5.3 | §4 步骤 3 的「副本一致性校验」列了 **3 份**，实际是 **4 份**——漏 `apps/client/src/shared/vendor/bitecs`（它被 `sync-shared --check` 覆盖，不是盲区，但「副本一致性」名不副实） | §4:62、§3:41-43 |
| 5.4 | §4:61 与 §4:70 两处引用的 `sync` 聚合命令**在 `package.json` 里不存在**（现有 `sync:shared`，它已串接 `sync-client`） | [package.json:18-19](package.json) |
| 5.5 | §4 末尾「流程比现状多一步『镜像刷新』，其余不变」低估了升级成本：一次上游升级要刷新 3 个镜像目录 + 处理 Cocos `.meta` + 跑 `verify:ecs`/`verify:sync`/`verify:vendor`/`verify:project` | §4:69-71 |
| 5.6 | `apps/shared/src/vendor/bitecs` 想登记进 `project.metadata.json.generated` 会撞上 [EXPECTED_GENERATED](scripts/verify-project-metadata.mjs) 的 `{shared, client}` **闭集** + [:209-210](scripts/verify-project-metadata.mjs) 拒未知 key；不登记则它是全仓唯一一条未登记的镜像链。**要显式选一个**并写进 §4 | [verify-project-metadata.mjs:26-35](scripts/verify-project-metadata.mjs) |
| 5.7 | [docs/OVERVIEW.md:25-34](docs/OVERVIEW.md) §2 表把 `apps/shared/src` 整体定义成「直接修改」的手写真源，表内**没有任何 bitECS 行可替换**。步骤 7 写「OVERVIEW.md §2 表」但没说改什么。应新增一行 `apps/shared/src/vendor/bitecs` = 「`vendor/bitecs` 的 shared 镜像 / 禁止手改」，并在同步链代码块里标出 vendor 支线 | §4:66 |
| 5.8 | 提案的「方案 A」与 [MIGRATION_GAMESTARTERKIT.md:28-30](docs/warren/MIGRATION_GAMESTARTERKIT.md) 的「方案 A」**不是同一件事**（后者是「shared 与 server 都**直接从中立位置 import**」），而 §2 取舍表从没否决过后者。它确实不行，理由是现成的：[apps/server/test/shared-zero-dep.test.ts:55](apps/server/test/shared-zero-dep.test.ts) 只许相对导入 + `sync-shared.mjs` 只搬 `apps/shared/src`，逃逸相对路径在两级镜像中断链——**这同时也是 §3「关键性质」那段真正的论据**，但提案一个字没写 | §2:28、§3:52-54 |
| 5.9 | 合入时须同批订正随附文档：`MIGRATION_GAMESTARTERKIT.md:4`、`:25` 仍写「bitecs 锁定在 `apps/client/src/lib/bitecs/`」，`:61` 的 M0 仍写「方案 A 或 B」未决。登记进 inventory 的若是一份自相矛盾的施工蓝图，下一个照文档施工的人会走到机检必红的路上 | docs/warren/ |

---

## 6. 建议的处理顺序

1. **先修 §1 的动机论证**（换成镜像方向 + client 非 workspace 两条），因为现在这版一条命令就能推翻，
   会拖累整份提案的可信度。
2. **把铁律 4 破例作为一次显式决策写进 §2**（接受就同批改铁律文字与 OVERVIEW，不接受就重选方案）。
   这是本提案唯一一个「机检永远不会告诉你」的决定。
3. **补齐 5 组阻塞的步骤**：`.meta` 处置 / `project.metadata.json` + 测试夹具 /
   CLAUDE.md+AGENTS.md 铁律 1 三方字面同改 / protected-paths 桶位与 `.lock` /
   `verify-toolchain.mjs` 的 `VERIFY_SYNC_COMMANDS`。
4. **§5 验证矩阵补行**：`verify:project`、`test:client`、`test:aggregate-chain-matrix`、
   `verify:inventory`（命令表那半边）。§8 的第 4 条换成有鉴别力的判据。
5. **warren 的 eid 命名空间**作为独立设计决策进 §6 与 MIGRATION §五，配一条并发回归测试。
6. **版权那条（4.3）单独评审**，不要搭车。

做完 1–5 之后，这个提案就是一个可以单 PR 合入、全矩阵可验的结构调整。

---

## 附录 A：本评审实际跑过的验证

> 全部在 scratchpad 中进行，**未修改仓库任何文件**（评审后 `git status --porcelain` 为空）。

### A.1 `@ts-nocheck` 在 shared 最严配置下确实压得住 → **不构成阻塞**

把 12 个文件拷进 `src/vendor/bitecs`，配一份与 `apps/shared/tsconfig.json` 逐项等价的 tsconfig
（`target:ES2021` / `lib:["ES2017"]` / `types:[]` / `strict` / `isolatedModules` /
`noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns` / `noFallthroughCasesInSwitch` /
`allowUnreachableCode:false` / `allowUnusedLabels:false` / `exactOptionalPropertyTypes` /
`noImplicitOverride` / `verbatimModuleSyntax`）：

```
$ ./node_modules/.bin/tsc -p <probe>/tsconfig.json
EXIT=0        # 零错误
```

结论：`TS1484`（verbatimModuleSyntax）、`TS1205`（isolatedModules）、`noUnusedLocals`
这类语法/grammar 级诊断都被首行 `@ts-nocheck` 豁免了。**「shared 是全仓最严的一层」不是本提案的障碍。**

### A.2 `verify:project` 双向夹逼

复刻 `apps/client/test/projectMetadata.test.ts` 的 fixture 并直接调用 `verifyProjectMetadata`：

- 基线 → `ok: true`
- 场景 A（执行 §4 步骤 6、metadata 未改）→ `ok: false`，
  `errors = ['第三方产物缺失：apps/client/src/lib/bitecs', '第三方产物缺失：apps/Cocos/assets/src/lib/bitecs']`
- 场景 B（metadata 改成 vendor 四条路径、测试夹具未改）→ `ok: false`，四条新路径全部「第三方产物缺失」
  ⇒ `projectMetadata.test.ts:118` 的 `assert.equal(baseline.ok, true)` 必挂

### A.3 server 侧现在就能 import bitECS

```
$ cd apps/server && node --import tsx <probe>.ts
query: [ 1 ] / targets: [ 2 ] / wildcard ok: function     RC=0
```

probe 直接 import 现状路径 `apps/client/src/lib/bitecs/index`。
另一个探针证明 tsconfig `include` 不隔离：`include:["src"]` 的工程里
`src/a.ts` import `../outside/b`，tsc 报的是 `outside/b.ts(1,14): error TS2322` —— 被 import 的
include 之外文件照样进 program 并被类型检查。

### A.4 `lib:["ES2017"]` 闸不拦 `globalThis`

同一文件里写 `Object.fromEntries([["a",1]])` 与 `(globalThis as any).X`，
`lib:["ES2017"]`、`target:ES2017`、`types:[]`：

```
error TS2550: Property 'fromEntries' does not exist on type 'ObjectConstructor'.
```

对 `globalThis` **零错误**——TS 把它当内建符号处理，与 lib 无关。

### A.5 多 world eid 串数据复现脚本

```ts
import { createWorld, createEntityIndex, addEntity, addComponent, query }
  from "<repo>/apps/client/src/lib/bitecs/index";

const Hp = { v: [] as number[] };          // 模块级 store（与 ballMove/GameComps.ts 同款）

// 场景 1：两个房间各自 createWorld()（= 提案 §6 / warren world.ts 的写法）
const roomA = createWorld(), roomB = createWorld();
const a = addEntity(roomA); addComponent(roomA, a, Hp); Hp.v[a] = 100;
const b = addEntity(roomB); addComponent(roomB, b, Hp); Hp.v[b] = 7;
// → eidA=1 eidB=1  Hp.v[eidA]=7   ← roomA 的血量被 roomB 覆盖
// → query(roomA,[Hp])=[1]  query(roomB,[Hp])=[1]   ← 各自看起来都正常

// 场景 2：共享一个 EntityIndex
const shared = createEntityIndex();
const roomC = createWorld(shared), roomD = createWorld(shared);
const c = addEntity(roomC); addComponent(roomC, c, Hp); Hp.v[c] = 100;
const d = addEntity(roomD); addComponent(roomD, d, Hp); Hp.v[d] = 7;
// → eidC=1 eidD=2  Hp.v[eidC]=100  ← 正确
```

### A.6 其他直接读源确认的断言

| 断言 | 位置 |
| --- | --- |
| `sync-client --check` 要求每个入库文件与每级目录都有 `.meta` | [sync-client.mjs:291,295](scripts/sync-client.mjs) |
| `verifyThirdParty` 对每条 paths `lstatSync`，缺失即报错 | [verify-project-metadata.mjs:417](scripts/verify-project-metadata.mjs) |
| 铁律 1 是 `verify-inventory` 的字面串断言，且 AGENTS/CLAUDE 须逐字一致 | [verify-inventory.mjs:717,700-703](scripts/verify-inventory.mjs) |
| `VERIFY_SYNC_COMMANDS` 是 `verify:sync` 组成的第二真源 | [verify-toolchain.mjs:26-29](scripts/verify-toolchain.mjs) |
| `protected-paths-lock` **刻意不锁** `generatedWriterOwned` | [protected-paths-lock.mjs:10-11](scripts/protected-paths-lock.mjs) |
| `EXPECTED_GENERATED` 是 `{shared, client}` 闭集 | [verify-project-metadata.mjs:26-35](scripts/verify-project-metadata.mjs) |
| `verify:core` 的命令序列（第一条 verify-toolchain，含 verify:project / verify:inventory / test:client） | [package.json:50](package.json) |
| bitECS 12 文件均以 `// @ts-nocheck` 开头；MPL 版权头只在 LICENSE 与 README | `apps/client/src/lib/bitecs/` |
| 迁移后 Cocos 侧 uuid 引用数为 0（bitECS 非 `cc.Component`） | `apps/Cocos/assets` 全树 grep |
