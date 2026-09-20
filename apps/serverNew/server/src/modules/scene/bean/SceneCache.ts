import { DiffMap, OnlyRedis, ServerHashJson, UtilTime } from '@arthropoda/game-engine'
import { SceneActorItem } from './SceneActorItem'

/**
 * 场景缓存数据,默认30天过期
 */
@OnlyRedis
export class SceneCache extends ServerHashJson {
    /**
     * 场景Id
     */
    id: string = ''

    /**
     * 系统id
     */
    sysId: int = 0

    /**
     * 配置Id
     */
    cId: int = 0

    /**
     * 场景内怪物数据
     */
    actors?: DiffMap<int, SceneActorItem>

    /**
     * 最后归属者
     * @alias f
     */
    lastOwnerUId: int = 0

    /**
     * 创建时间
     * @alias g
     */
    createdTime: int = 0

    expireTime(): number {
        return UtilTime.DAY_SECOND * 30
    }
}
