# apps/Unity — Unity 客户端工程（骨架）

对标 sect 的 `Unity/`：与 `apps/Cocos` 平行的另一个引擎壳，消费 `apps/client` 中
**引擎无关的子集**（`logic/` + `shared/` + `lib/bitecs/`；`Main.ts`/`view/` 依赖
cc+fairygui，`core/` 与 `net/` 也需要按 Unity 生态重写/适配）。
sect 的路线是用 **pyts** 把 TS 转译为 C#（`Assets/PytsCore` + `Assets/Game`）。

## 现状

当前只是目录占位，尚不能作为可用 Unity 客户端：

- `Assets/` —— Unity 资源与脚本（待建）
- `Packages/` —— Unity 包清单（待建）
- `ProjectSettings/` —— Unity 工程配置（待建）

## 后续路线（规划，未实施）

1. 确定 Unity 版本与渲染管线，用 Unity Hub 在本目录初始化真实工程（替换本骨架）。
2. 引入 pyts 类 TS→C# 转译管线，消费 `apps/client/src` 的引擎无关子集（logic/shared/bitecs
   优先；⚠ 投入前先拿 `logic/rooms/ballMove` + `lib/bitecs` 做一次转译 spike——bitECS 的
   TypedArray/SoA 布局与 12 文件字节锁约束下的可行性未验证过）。
3. 与 `apps/Cocos` 共用 `apps/shared` 契约与 `apps/art` 的 FairyGUI 源。
