import { Mod, ServerHash } from '@arthropoda/game-engine'

@Mod
export class HServer extends ServerHash {
    /**
     * 区服Id
     */
    id: int = 0

    /**
     * 当前活动历练boss等级 kui_cow_open 配置表id
     */
    kuiCowOpenId: int = 0

    /**
     * 已经刷出来的活动历练boss等级 kui_cow 表id
     */
    currKuiCowLv: int = 0
}
