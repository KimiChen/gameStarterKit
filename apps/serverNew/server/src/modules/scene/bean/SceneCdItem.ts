import { Bean } from '@arthropoda/game-engine'

export class SceneCdItem extends Bean {
    /**
     * sysId_cId
     */
    key: string = ''

    /**
     * 系统Id
     */
    sysId: int = 0

    /**
     * 配置Id
     */
    cId: int = 0

    /**
     * 下次可进场景时间
     */
    nextIntoTime: int = 0
}
