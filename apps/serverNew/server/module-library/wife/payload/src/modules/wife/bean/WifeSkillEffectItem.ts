import { Bean, DiffMap, OnlyRedis } from '@arthropoda/game-engine'
import { WifeEffectItem } from './WifeEffectItem'

/**
 * 红颜技能
 */
export class WifeSkillEffectItem extends Bean {
    /**
     * 技能id_对象Id
     */
    id: string = ''

    /**
     * 效果集合
     */
    @OnlyRedis
    effects?: DiffMap<int, WifeEffectItem>

    /**
     * 当天触发效果次数
     */
    triggerNum: int = 0

    /**
     * 保底使用次数
     */
    @OnlyRedis
    useNum: int = 0
}
