import { SceneActor } from '../model/SceneActor'
import { RoundWheel } from '../roundWheel/RoundWheel'

/**
 * 地图房间信息
 */
export class SceneRoom {
    // #region 场景测试状态
    /** 暂停状态（0正常 1暂停） */
    isStop: int = 0
    // #endregion

    /** 地图名称 */
    name: string = ''

    /** 地图唯一ID  */
    mapId: string = ''

    /** 房间Id */
    roomId: int = 0

    /** 系统Id */
    sysId: int = 0

    /** 配置Id */
    cId: int = 0

    /** 场景定时停止 0不过期 */
    stopTime: int = 0

    /** 场景是否已销毁 */
    isDestory: boolean = false

    /** 是否运行中 */
    running: boolean = false

    /** 定时器 */
    roundWheel?: RoundWheel

    /** 自增ID，唯一标示 */
    incrId: int = 10000

    /** 自buff增ID，唯一标示 */
    buffUId: int = 0

    /** 自增位置ID，唯一标示 */
    posId: int = 0

    /**  玩家列表 <uId,actor> */
    players: Map<number, SceneActor> = new Map()

    /** 联盟玩家映射<guild,<uId,actor>> */
    guildPlayers: Map<number, Map<number, SceneActor>> = new Map()

    /** 野怪列表 <id,actor> */
    monsters: Map<number, SceneActor> = new Map()
}
