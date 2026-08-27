# bitecs（数据导向 ECS）

本目录为 [bitECS](https://github.com/NateTheGreatt/bitECS) 中 `src/core/` 的 **12 个 TypeScript 文件的锁定副本**（与上游偏差仅两处：每文件首行一行 `// @ts-nocheck` + Relation.ts 的 `./index` 自指导入改写，见「与上游的偏差」一节），遵循 MPL-2.0 许可证（见同目录 [LICENSE](./LICENSE)，文件级 copyleft：改动这些文件须保持 MPL 并公开——所以我们不改逻辑、字节锁定）。

## 来源

- 仓库：https://github.com/NateTheGreatt/bitECS
- 版本：`0.4.0`（tag）
- Commit：`efacc63b95b66d582603ab5c7a5b3fbf2bd74952`
- 原路径：`src/core/`（含 `utils/`）
- 版权：Copyright (c) Nate Martin（MPL-2.0 License）

## 为什么是源码而不是 npm dist

npm 包中的 `dist/*.mjs` 含 `??`/`?.` 等 ES2020 语法，超本仓库 ES2017 下限（铁律 4，
老 JSCore 会崩）；vendor TS 源码则由 Cocos 编译链随项目统一降阶，且可被无头 typecheck 覆盖。

## 用法速览（0.4 API，与 0.3 差异很大，别照抄网上旧教程）

```ts
import { createWorld, addEntity, addComponent, removeEntity, query } from "./index";

// 组件 = SoA store：每字段一条按 eid 索引的数组（数字/布尔/字符串/对象均可，无需注册 schema）
const Position = { x: [] as number[], y: [] as number[] };

const world = createWorld();
const eid = addEntity(world);
addComponent(world, eid, Position);
Position.x[eid] = 10;                       // 数据直写 store（无 set/get 包装）

for (const id of query(world, [Position]))  // 系统 = 普通函数里跑 query
    Position.y[id] += 1;

removeEntity(world, eid);
```

- `addComponent` 按需自动注册组件；`query` 首次调用即注册并缓存，之后增量维护。
- `Not/Or/And` 查询修饰、`observe/onAdd/onRemove/onSet` 钩子、`createRelation` 层级关系见上游文档。
- 不用到的 `serialization`/`legacy` 子包未 vendor。

## 与上游的偏差（升级流程必读）

仅两处，均为兼容补丁、不改逻辑：

1. 每个 .ts 首行加了一行 `// @ts-nocheck`：上游以非 strict（`noImplicitAny: false`，见其 tsconfig）
   编译，在本仓库 `strict: true` 下会误报（Relation/Entity 的 unique symbol 索引与 narrowing）。
   字节锁禁改源码，故以此注释隔离（纯注释，Cocos 构建与运行时零影响）。
2. `Relation.ts` 的 `from '.'` 改为 `from './index'`：`.` 自指目录导入 Cocos 的 SystemJS
   packer 解析不了（编辑器报「无效的模块说明符：.」），显式 `./index` 语义相同。

## 升级流程（仅框架维护团队）

本仓库没有 bitECS 的自动抓取或更新命令，这是有意的：这里锁定的是经过 Cocos
SystemJS 与严格 TypeScript 约束适配的源码副本，而不是可直接替换的 npm dist。普通开发者
直接使用仓库已入库的 12 个文件，禁止在此目录做功能修改。

需要升级时，由框架维护团队按上游 tag/commit 手工执行以下流程：

1. 从上游 `src/core/`（含 `utils/`）取得与目标版本对应的 12 个文件，记录版本、commit
   和许可证信息。
2. 只替换 `apps/client/src/lib/bitecs/` 中的源码真相，不直接编辑 Cocos 镜像；完成后运行
   `npm run sync:client` 同步 `apps/Cocos/assets/src/lib/bitecs/`。
3. 对每个文件保留首行 `// @ts-nocheck` 兼容注释，并将 `Relation.ts` 中的 `from '.'`
   改为 `from './index'`；除这两处适配外不改上游逻辑。
4. 按更新后的 12 个文件重算 `scripts/bitecs.sha256`，然后运行 `npm run verify:ecs`、
   `npm run verify:sync` 及相关类型检查和测试。

只有上述校验通过后，才把源码、Cocos 镜像、锁文件和版本记录作为同一变更提交。维护团队
也应在升级评审中确认新版本仍满足本仓库的 ES2017、运行时和许可证约束。

## 文件清单（SHA-256，锁基线 = 上游文件 + 上述两处偏差）

校验命令：`npm run verify:ecs`（仓库根；基线 `scripts/bitecs.sha256`）。
