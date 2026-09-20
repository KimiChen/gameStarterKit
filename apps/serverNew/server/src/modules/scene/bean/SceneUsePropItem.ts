import { Bean } from '@arthropoda/game-engine'

export class SceneUsePropItem extends Bean {
    /**
     * 道具Id
     */
    propId: int = 0

    /**
     * 使用时间
     */
    lastTime: int = 0
}
