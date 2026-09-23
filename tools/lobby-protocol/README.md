# Lobby 协议生成核心

- 同一套 schema 域渲染、AST 读取和 registry 渲染同时供旧插件生成器与 `serverNew` kit 使用；修改本目录时同时跑旧生成器的 `plugin-codegen.test.ts` 与新宿主 `verify:kit-clean-host`，不得复制第二套模板。
- `--check` 必须只读；写入前先在内存完成全域校验，域删除需显式 `--allow-delete <id>`，已发布域内容变化需递增 `contractVersion`。
- 生成器只负责 shared 协议产物，不处理客户端镜像、旧服务端端点或 SQL；新宿主随后独立编译契约和生成模块索引。
