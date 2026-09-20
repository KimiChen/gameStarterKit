import { AttrItem } from '../../attr/model/AttrItem'
import { SceneTimeItem } from './SceneTimeItem'

export class SceneActor {
    // #region 参数-玩家属性

    public sysId: int = 0

    /** 玩家初始属性 */
    public oriAttr: AttrItem = new AttrItem()

    /** @var AttrItem 战斗属性 */
    public fightAttr: AttrItem = new AttrItem()

    /** @var bool 是否生效至宝 */
    public rareEffectAttr: boolean = false

    /** @var bool 是否生效时装 */
    public fashionEffectAttr: boolean = false

    /** @var AttrItem[] 至宝、时装属性 */
    public attrMods: Array<AttrItem> = []
    //#endregion

    // #region 参数-基础属性

    /** 类型:0玩家 1boss 2小怪 3任务怪 4假人(怪物) */
    public type: int = 0

    /** 是否为邀请玩家 */
    public inviter: boolean = false

    /** 剩余血量 */
    public leftHp: int = 0

    /** 是否在客户端显示 */
    public isDisplay: boolean = true

    /** 索引 */
    public id: int = 0

    /** 配置Id */
    public cId: int = 0

    /** 配置组Id */
    public cGroupId: int = 0

    /** 玩家Id */
    public uId: int = 0

    /** 区服Id */
    public sId: int = 0

    /** 名字 */
    public name: string = ''

    /** 等级 */
    public lv: int = 0

    /** 联盟编号 */
    public guild: int = 0

    /** 评分(战力) */
    public fp: int = 0

    /** 境界 */
    public realm: int = 0

    /** 称号 */
    public titleId: int = 0

    /** 脸 */
    public face: int = 0

    /** 脸饰 */
    public faceDecorate: int = 0

    /** 发饰 */
    public hairDecorate: int = 0

    /** 发型 */
    public hair: int = 0

    /** 种族 */
    public race: int = 0

    /** 法宝强度 */
    public weaponMaster: int = 0

    /** 功法强度 */
    public gongMaster: int = 0

    /** 功法等级 */
    public gongLv: int = 0

    /** 性别 */
    public sex: int = 0

    /** 主线任务Id */
    public mainTaskId: int = 0

    /** 主线章节任务进度 */
    public mainTaskProgress: int = 0

    /** 主线是否已达标，停止自动攻击 */
    public mainTaskStopAutoAtk: int = 0

    /** 主线任务怪血量 cId=>hp */
    public mainTaskMonster: Map<int, int> = new Map<int, int>()

    /** @var array  奇珍资源额外掉落,[道具id,额外掉落万分比] */
    public treasurePropAdd: Map<int, int> = new Map<int, int>()

    /** 大招-恢复门槛 */
    public skillRecoveryLimit: int = 0

    /** 大招-最大释放次数 */
    public skillMaxTimes: int = 0

    /** 穿戴装备开关:特殊场景默认不开启  */
    public wearOpen: boolean = true

    /** 装备-至宝 */
    public rareId: int = 0

    /** 装备-时装 */
    public fashionId: int = 0

    /** 装备-神通 */
    public magicId: int = 0

    /** 装备-神通CD */
    public magicCd: int = 0
    /** @var PbFashionWearItem[] $fashionWear 装备-穿戴列表 */
    //public array $fashionWear = [];

    /** 修炼-斩心魔关卡*/
    public heartDemonChapter: int = 0

    /** 是否已经死了，墓碑状态 */
    public isDead: boolean = false

    /** 上一次死掉的轮次 */
    public deadRound: int = 0

    /** 上一次死掉的具体时间 */
    public deadTime: int = 0

    /** 复活的轮次 */
    public rebornRound: int = 0

    /** 复活的时间 */
    public rebornTime: int = 0

    /** 已复活次数,单场景下可复活n次 */
    public: int = 0

    /** @var array 特权卡 [特权卡id => 过期时间] */
    public tqs: Map<int, int> = new Map<int, int>()

    /** 法宝等级 */
    public weaponLv: int = 0

    /** 装备穿戴表现 */
    public equipWearShow: int = 0

    /** @var FightKillCountItem[] 击杀他人次数 */
    //public array $killCounts = [];

    /** @var SceneTimeItem|null 红名值 */
    public evil?: SceneTimeItem

    //#endregion

    public monsterToActor(sysId: int, type: int, cGroupId: int, conf: IConfMonster) {
        this.sysId = sysId
        this.type = type
        this.cId = conf.id
        this.cGroupId = cGroupId
        this.lv = conf.level
        this.fp = conf.fp
        this.realm = conf.realm
        // 初始属性
        this.oriAttr = new AttrItem()
        this.oriAttr.atk = conf.atk
        this.oriAttr.def = conf.def
        this.oriAttr.hp = conf.hp
        this.oriAttr.hit = conf.hit
        this.oriAttr.dodge = conf.dodge
    }
}
