# rooms/core/

房间组合策略层，负责 start/access/profile policy。这里不声明玩法人数或复制玩法规则；人数来自玩法 roster，玩法行为来自 `GameMode`。

修改 policy 时同步检查 `RoomProfile` 的组合约束和 `GameRoom` 的 admission/lifecycle 测试。
