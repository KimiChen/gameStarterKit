# player/

玩家档案和角色状态的服务端适配层。外部账号权威仍在 WebPlatform；本目录只负责本地读取、修复和角色状态接缝。

- `userStore.ts`：玩家档读取与持久化入口。
- `character.ts` / `characterState.ts`：角色状态与 ready 流程。
- `characterRepair.ts`：角色登记失败后的本地补偿 worker。
