# rooms/modes/

每个子目录是一个玩法实现；玩法单源和生成契约优先于服务端聚合文件。

- 玩法消息、状态和 catalog 改动先运行 `npm run codegen:gameplays`。
- `catalog.ts` 与 `*.generated.ts` 是装配面，不在这里手写新增玩法登记。
- 玩法规则尽量留在 mode 内，通用 transport、鉴权和生命周期留在 `GameRoom`。
