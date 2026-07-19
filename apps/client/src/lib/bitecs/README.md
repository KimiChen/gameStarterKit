# bitecs（数据导向 ECS）

本目录为 [bitECS](https://github.com/NateTheGreatt/bitECS) 中 `src/core/` 的 **12 个 TypeScript 文件的锁定副本**（唯一偏差：每文件首行一行 `// @ts-nocheck`，见下文），遵循 MPL-2.0 许可证（见同目录 [LICENSE](./LICENSE)，文件级 copyleft：改动这些文件须保持 MPL 并公开——所以我们不改逻辑、字节锁定）。

## 来源

- 仓库：https://github.com/NateTheGreatt/bitECS
- 版本：`0.4.0`（tag）
- Commit：`efacc63b95b66d582603ab5c7a5b3fbf2bd74952`
- 原路径：`src/core/`（含 `utils/`）
- 版权：Copyright (c) Nate Martin（MPL-2.0 License）

## 为什么是源码而不是 npm dist

npm 发行物（`dist/*.mjs`）含 `??`/`?.` 等 ES2020 语法，超本仓库 ES2017 下限（铁律 4，
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

**升级流程**：拉上游新文件 → 每文件首行补 ts-nocheck 注释、检查 `from '.'` → 重算 `scripts/bitecs.sha256`。

## 文件清单（SHA-256，锁基线 = 上游文件 + 上述两处偏差）

校验命令：`npm run verify:ecs`（仓库根；基线 `scripts/bitecs.sha256`）。
