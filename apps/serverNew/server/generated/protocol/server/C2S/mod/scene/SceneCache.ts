import { SceneActorItem } from '../scene/SceneActorItem'

export interface SceneCache {
    /**
     * 场景Id
     */
    id: string
    /**
     * 系统id
     */
    sysId: int
    /**
     * 配置Id
     */
    cId: int
    /**
     * 场景内怪物数据
     */
    actors?: Map<int, SceneActorItem>
    /**
     * 最后归属者
     *       @alias f
     */
    lastOwnerUId: int
    /**
     * 创建时间
     *       @alias g
     */
    createdTime: int
}
