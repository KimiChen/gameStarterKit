import { Bean } from '@arthropoda/game-engine'

/**
 * 品质保底信息
 */
export class ForgeBean extends Bean {
    /**
     * 品质id
     */
    id: int = 0

    /**
     * 品质保底辅助次数
     */
    times: int = 0
}
