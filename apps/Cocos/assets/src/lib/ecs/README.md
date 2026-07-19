# ECS（来自 Oops Framework）

本目录为 [Oops Framework](https://github.com/dgflash/oops-plugin-framework) 中 `assets/libs/ecs/` 的 **8 个纯 TypeScript 文件的字节不变副本**，遵循 MIT 许可证（见同目录 [LICENSE](./LICENSE)）。

## 来源

- 仓库：https://github.com/dgflash/oops-plugin-framework
- 版本：`2.1.0.20251026`
- Commit：`46bcb588282c7635e5c02411d9f17112ae1a9cca`
- 原路径：`assets/libs/ecs/`
- 版权：Copyright (c) 2022 dgflash（MIT License）

## 文件清单（SHA-256，与上游逐字节一致）

| 文件 | SHA-256 |
| --- | --- |
| ECS.ts | `58bf19af8f9c38343e3e2534ef6bcfeb7d5ecfeeb77c7b9c528bd58617afa055` |
| ECSComp.ts | `8660621325f28e6f1f28a28eba50c7bd0116a04ba313dfd65c8743a18a96ca00` |
| ECSEntity.ts | `6cf35a5741adc4006cbc38c7abae0d973a2a65c3d2037372e23cd71bf36ec414` |
| ECSGroup.ts | `7724f23d27f6168aa51ab31ea759f397462163889c2dea42ee793143f84d3886` |
| ECSMask.ts | `05062cbb1beeef295327f6bb2f49df9ac93212616198b9d4029059d5192e106f` |
| ECSMatcher.ts | `680bdd1e4990026a51e0b8d1236072109336ea8c522e0d1497bd4e078fae0b73` |
| ECSModel.ts | `0220baab60aabc8fdc91e926fea756007155793fc1ff9130fbae8ebdfd356b30` |
| ECSSystem.ts | `cb79f9a402089fd04f95c8537694b7c8a0845e5c7be4b18ad1e02697631809e3` |

校验命令（在本目录执行）：

```bash
shasum -a 256 -c <<'EOF'
58bf19af8f9c38343e3e2534ef6bcfeb7d5ecfeeb77c7b9c528bd58617afa055  ECS.ts
8660621325f28e6f1f28a28eba50c7bd0116a04ba313dfd65c8743a18a96ca00  ECSComp.ts
6cf35a5741adc4006cbc38c7abae0d973a2a65c3d2037372e23cd71bf36ec414  ECSEntity.ts
7724f23d27f6168aa51ab31ea759f397462163889c2dea42ee793143f84d3886  ECSGroup.ts
05062cbb1beeef295327f6bb2f49df9ac93212616198b9d4029059d5192e106f  ECSMask.ts
680bdd1e4990026a51e0b8d1236072109336ea8c522e0d1497bd4e078fae0b73  ECSMatcher.ts
0220baab60aabc8fdc91e926fea756007155793fc1ff9130fbae8ebdfd356b30  ECSModel.ts
cb79f9a402089fd04f95c8537694b7c8a0845e5c7be4b18ad1e02697631809e3  ECSSystem.ts
EOF
```

## 约定

- **本目录 8 个 `.ts` 文件禁止修改**。升级方式：从上游仓库整体替换并更新本 README 的 commit 与哈希。
- 该库为纯 TS 实现，只有目录内相对导入，不依赖 `cc` 模块，可安全用于微信小游戏构建。
- `.meta` 文件由 Cocos Creator 编辑器首次打开时生成，不属于上游文件。

## 快速用法

```ts
import { ecs } from "./lib/ecs/ECS";

// 1. 定义组件
@ecs.register("Move")
class MoveComp extends ecs.Comp {
    speed: number = 0;
    reset() { this.speed = 0; }
}

// 2. 定义实体
@ecs.register("Player")
class PlayerEntity extends ecs.Entity {
    Move!: MoveComp;
    protected init() { this.addComponents<ecs.Comp>(MoveComp); }
}

// 3. 定义系统
class MoveSystem extends ecs.ComblockSystem implements ecs.IEntityEnterSystem {
    filter(): ecs.IMatcher { return ecs.allOf(MoveComp); }
    entityEnter(e: PlayerEntity): void { /* ... */ }
    update(e: PlayerEntity): void { /* ... */ }
}

// 4. 根系统驱动（每帧调用 rootSystem.execute(dt)）
const rootSystem = new ecs.RootSystem();
rootSystem.add(new MoveSystem());
rootSystem.init();
```

完整文档见 Oops Framework 官方文档：https://oops-1255342636.cos-website.ap-shanghai.myqcloud.com/doc/
