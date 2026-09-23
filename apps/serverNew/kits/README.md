# 原生 kit

每个子目录包含一个 `serverNew` kit 的清单、说明、能力/数据声明和随包验证。业务源码分别位于原生 modules、shared/kits 和 client/kits；协议域归 shared/native。

使用 `npm run kit:native -- pack/install/check/test/uninstall`，生成用 `npm run codegen:native-kits`。此发现根与旧 `apps/kits/` 分离，不通过旧服工具安装。完整说明见 [原生工具](../tools/kit/README.md)，示例见 [gameDemo](gameDemo/README.md)。
