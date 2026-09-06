# apps/Unity — Unity 方向研究占位

本目录不是可用的 Unity 客户端，也不是当前核心框架的第二引擎交付。它只保留目录形状，供以后单独评估
跨引擎复用；准确分类见[额外功能与参考实现](../../docs/EXTRAFEATURES.md#38-配表负载与-unity-实验)。

## 现状

当前只有三个空目录及其 `.gitkeep`：

- `Assets/` —— Unity 资源与脚本（待建）
- `Packages/` —— Unity 包清单（待建）
- `ProjectSettings/` —— Unity 工程配置（待建）

仓库没有 Unity 版本、`Packages/manifest.json`、`ProjectSettings/ProjectVersion.txt` 或其他有效工程配置，
也没有 C# 生成物、pyts/TS→C# 管线、运行入口或测试闭环。
`apps/client` 的 `logic/`、`shared/`、`lib/bitecs/` 也尚未证明可被 Unity 直接消费。

如果实际项目另行立项，应先用 `logic/rooms/ballMove`、shared 契约与 bitECS 的 TypedArray/SoA 用法做
最小可行性实验，再决定重写 adapter 还是引入转换工具；这项实验不构成 gono 的路线承诺或
[核心收口计划](../../plan-v3.md) 的验收项。
