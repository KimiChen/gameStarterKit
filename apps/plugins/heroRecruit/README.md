# 英雄招募插件

- 招募目录与铜币价格只在 `apps/shared/src/heroRecruit/catalog.ts` 定义；客户端不得传入或本地修改价格。
- 服务端通过玩家 Bean 在同一 Action 中扣铜币并记录归属；`heroRecruit.buy` 是幂等写，重试不会重复扣款或重复拥有。
- 客户端入口打开全屏 `HeroRecruitScene` Cocos 页；它是独立功能场景，不改变默认 Lobby 或 GameRoom 传输。
