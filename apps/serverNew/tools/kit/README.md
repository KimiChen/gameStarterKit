# 原生 kit 工具

独立服务 `serverNew`，不加载或调用 `apps/server/tools`。Node 22；根依赖安装后运行：

```bash
npm run codegen:native-kits
npm run verify:native-kits
npm run kit:native -- check gameDemo
npm run kit:native -- test gameDemo
npm run kit:native -- pack gameDemo --out /tmp/gameDemo-0.3.1.zip
npm run kit:native -- install /tmp/gameDemo-0.3.1.zip --root /path/to/compatible-host
npm run kit:native -- uninstall gameDemo --root /path/to/compatible-host
npm run test:native-kits
```

`--root` 缺省当前工具所在仓库；宿主须有原生框架、客户端 native 扩展点、Node/pnpm 依赖和 Git 工作区。旧 plugin 包与原生格式不互通。生成命令只写 shared/native 与 client/native；同步由 `npm run sync:shared` / `sync:client` 执行，服务端生成由原生 `pnpm generate` 执行。

安装只写包所有权内真源，拒绝覆盖未登记或本地修改文件，拒绝越界、符号链接、损坏 ZIP、不兼容宿主、降级和同版本改包。生成物不打入包。清单仅支持代码与 Cocos View，尚未支持 FGUI/资源包及自定义第三方依赖。代码安装与协议生成失败会恢复文件；Redis 数据保持关闭，避免不完整代码继续写数据。操作锁位于 `apps/serverNew/.kit-operation-lock`；进程意外退出时需确认 owner.json 中 PID 已停止后人工移除，不能盲删在线锁。

可写 kit 安装/升级/卸载须先用宿主 `pnpm kit:lifecycle ... --operation drain` 排空，并停止所有 worker。指定 `NATIVE_KIT_PROFILE='{"platform":"bearjoy","version":"live","sid":1}'` 后执行包命令。首次安装也需要明确部署。安装成功仍是 drained，显式 resume 才开放；卸载保留 detached 和业务数据，重装支持同数据版本的兼容保留恢复，不提供删除数据命令。

协议 descriptor 用语法解析，不执行包代码。编解码从共享旧协议真源生成 native 链接版本；旧协议注册表不增加原生 kit 域。每次 CLI 运行前后比对 Git 管理及未忽略的 `apps/server/` 文件哈希，原生写路径另外禁止进入旧服目录。客户端以独立 catalog 合入已有扩展点，并在注册时检测冲突。
