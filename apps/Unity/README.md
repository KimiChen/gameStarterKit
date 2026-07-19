# apps/Unity — Unity 客户端工程（骨架）

对标 sect 的 `Unity/`：与 `apps/Cocos` 平行的另一个引擎壳，消费同一份 TS 游戏代码
（`apps/client`）。 sect 的路线是用 **pyts** 把 TS 转译为 C#（`Assets/PytsCore` + `Assets/Game`）。

## 现状

最小骨架，尚未接入任何构建管线：

- `Assets/` —— Unity 资源与脚本（待建）
- `Packages/` —— Unity 包清单（待建）
- `ProjectSettings/` —— Unity 工程配置（待建）

## 后续路线（规划，未实施）

1. 确定 Unity 版本与渲染管线，用 Unity Hub 在本目录初始化真实工程（替换本骨架）。
2. 引入 pyts 类 TS→C# 转译管线，消费 `apps/client/src`（logic/net/shared 优先，view 层需引擎适配）。
3. 与 `apps/Cocos` 共用 `apps/shared` 契约与 `apps/art` 的 FairyGUI 源。
