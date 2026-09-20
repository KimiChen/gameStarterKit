import { Bean } from '@arthropoda/game-engine'

export class ArenaMatchItem extends Bean {
    /**
     * 档位id
     */
    id: int = 0

    /**
     * 类型：1真人、2npc机器人、3自身镜像机器人
     */
    type: int = 0

    /**
     * 目标id
     */
    targetId: int = 0

    /**
     * 机器人名称
     */
    name: string = ''

    /**
     * 机器人种族
     */
    race: int = 0

    /**
     * 机器人声望
     */
    prestige: int = 0

    /**
     * 机器人性别
     */
    sex: int = 0
}
