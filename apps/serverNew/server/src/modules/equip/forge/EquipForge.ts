import { UtilObject, timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { Props } from '../../props/inventory/Props'
import { User } from '../../user/bean/User'
import { EquipErrors } from '../EquipErrors'
import { ForgeBean } from '../bean/ForgeBean'
import { ForgePoolBean } from '../bean/ForgePoolBean'
import { EquipInventoryStore } from '../inventory/EquipInventoryStore'
import { EquipDefine } from '../rules/EquipDefine'
import { EquipForgeProcess } from './EquipForgeProcess'

/**
 * 基础炼器类
 */
export class EquipForge implements EquipForgeProcess {
    //#region 常量
    /** 池类型 */
    static readonly POOL_TYPE_DEFAULT = 1

    /** 打造类型-单次打造 */
    static readonly DRAW_TYPE_ONE = 1

    /** 打造类型-多次打造 */
    static readonly DRAW_TYPE_MORE = 2

    /** 打造类型-单次仙玉打造 */
    static readonly DRAW_TYPE_ONE_1001 = 3

    /** 炼器可保证必定获得当前阶段最高等级的装备 */
    static readonly USE_TYPE_1 = 1

    /** 炼器可保证必定获得红色品质的装备 */
    static readonly USE_TYPE_2 = 2

    /** 炼器可保证必定获得橙色品质的装备 */
    static readonly USE_TYPE_3 = 3

    /** 炼器可保证必定获得金色品质的装备 */
    static readonly USE_TYPE_4 = 4
    //#endregion

    //#region 属性
    /**
     * 打造用户
     */
    user: User

    /**
     * 池Id
     */
    poolId: int = 0

    /**
     * 打造方式 1单次打造 2多次打造
     */
    drawType: int = 1

    /**
     * 打造次数
     */
    drawCount: int = 0

    /**
     * 特殊道具使用ID
     */
    propUseId: int = 0

    /**
     * 打造时间
     */
    currentTime: int = 0

    /**
     * 品质随机池 [品质 => 权重]
     */
    rebuildQualityPools: Map<int, int> = new Map()

    /**
     * 重组后的装备池 [品质 => [装备id => 权重]]
     */
    rebuildPools: Map<int, Map<int, int>> = new Map()

    /**
     * 抽取配置
     */
    poolConf: IConfEquip_draw

    /**
     * 用户当前池信息
     */
    forgePoolItem: ForgePoolBean

    /**
     * 单次抽中的装备配置
     */
    equipConf?: IConfEquip

    /**
     * 跑马灯类型
     */
    pushType: int = 20 // SystemInfoDefine.EquipForge_20

    /**
     * 设置奖励响应协议
     */
    pbRes?: AwardResponse

    /**
     * 打造获得装备配置
     * 装备配置Id，
     */
    forgeEquips: Map<int, PropItem> = new Map()

    /** 当前新开炉装备配置id */
    drawCId: int = 0

    /** 玩家所在等级阶段 */
    lvRangeId: int = 0

    /** 是否需要重新组建随机池 */
    needRebuild = false
    //#endregion

    // #region 构造化

    constructor(user: User, drawType: int, poolId = 1, propUseId = 1, res?: AwardResponse) {
        this.user = user
        this.currentTime = timestamp()
        this.poolId = poolId
        this.propUseId = propUseId
        this.lvRangeId = this.poolId * 100000 + Math.floor(this.user.lv / 10) * 10
        this.drawType = drawType
        this.drawCount = this.drawType == EquipForge.DRAW_TYPE_MORE ? 5 : 1
        this.pbRes = res

        // 系统装备池
        this.poolConf = C.equip_draw(this.poolId)
        // 打造数据初始化
        this.forgePoolItem = this.initForgePool()
    }

    /**
     * 检测打造信息初始化
     */
    initForgePool(): ForgePoolBean {
        // 初始化玩家装备池信息
        let poolItem = this.user.equip.forgePools.get(this.poolId)
        if (poolItem == null) {
            poolItem = new ForgePoolBean({ id: this.poolId })
            for (const [, quality] of EquipDefine.FORGE_BASE_QUALITY_MAPPING) {
                poolItem.qualityBaseInfo.set(
                    quality,
                    new ForgeBean({
                        id: quality,
                    }),
                )
            }
            this.user.equip.forgePools.set(this.poolId, poolItem)
        }

        return poolItem
    }
    // #endregion

    // #region 炼器执行流程
    /**
     * 抽取前置校验
     * @return void
     */
    check(): void {
        // 玩家等级阶段校验
        if (!this.poolConf.lvRange.has(this.lvRangeId)) {
            throw SystemErrors.ProtectModuleOff
        }

        // 校验打造方式类型
        if (
            ![EquipForge.DRAW_TYPE_ONE, EquipForge.DRAW_TYPE_ONE_1001, EquipForge.DRAW_TYPE_MORE].includes(
                this.drawType,
            )
        ) {
            throw SystemErrors.SysParamError
        }

        // 特殊道具使用id校验
        if (this.propUseId > 0 && !this.poolConf.specialCost.has(this.propUseId)) {
            throw SystemErrors.SysNoConf
        }

        // 玩家当前池信息是否初始化
        if (this.forgePoolItem == null) {
            throw SystemErrors.SysParamError
        }

        // 单次仙玉每日次数限制校验
        if (
            this.drawType == EquipForge.DRAW_TYPE_ONE_1001 &&
            this.forgePoolItem.gcTimes >= this.poolConf.halfDailyTimes
        ) {
            throw SystemErrors.ProtectModuleOff
        }

        // 装备库容量是否已满校验
        if (EquipInventoryStore.getEquipNum(this.user) + this.drawCount > Param.EquipNumMax) {
            throw EquipErrors.EquipBagFull
        }
    }

    /**
     * 打造消耗
     * @return void
     */
    async cost(): Promise<void> {
        // 消耗基础道具
        let propId = 0
        let costNum = 0
        const costArr: PropItem[] = []

        switch (this.drawType) {
            case EquipForge.DRAW_TYPE_MORE: // 多连抽
                {
                    ;[propId, , costNum] = this.poolConf.lvRange.get(this.lvRangeId).cost
                    // 多连标记:首次多连免费
                    if (this.forgePoolItem.tenTag == 0) {
                        costNum = 0
                        this.forgePoolItem.tenTag = 1
                    }
                }
                break
            case EquipForge.DRAW_TYPE_ONE: // 单抽-精铁
                {
                    ;[propId, costNum, ,] = this.poolConf.lvRange.get(this.lvRangeId).cost

                    // 如果道具不足则使用次级道具
                    if (this.poolConf.isCostProp && !Props.checkPropCount(this.user, propId, costNum, false)) {
                        const [costPropId, costPropNum] = this.poolConf.costProp
                        costNum = costPropNum * this.drawCount
                        propId = costPropId
                    }

                    // 单抽免费打造
                    if (
                        this.poolConf.freeDailyTimes > 0 && // 免费开关
                        this.currentTime >= this.forgePoolItem.nextCanFreeTime // 冷却时间已过
                    ) {
                        // 消耗为0
                        costNum = 0

                        // 重置半价次数
                        this.forgePoolItem.gcTimes = 0

                        // 更新cd
                        this.forgePoolItem.nextCanFreeTime = this.currentTime + this.poolConf.freeCd
                    }
                }

                break
            case EquipForge.DRAW_TYPE_ONE_1001: // 单抽-仙玉
                {
                    ;[propId, costNum] = this.poolConf.lvRange.get(this.lvRangeId).firstCostProp
                    this.forgePoolItem.gcTimes++
                }
                break
        }

        // 基础消耗-陨铁、仙玉
        if (propId && costNum) {
            costArr.push({ propId: propId, num: costNum })
        }

        // 消耗特殊道具
        if (this.propUseId) {
            // eslint-disable-next-line prefer-const
            let [usePropId, useCostNum, moreUseCostNum] = this.poolConf.specialCost.get(this.propUseId).costNum
            useCostNum = this.drawType == EquipForge.DRAW_TYPE_MORE ? moreUseCostNum : useCostNum
            if (usePropId && useCostNum) {
                costArr.push({ propId: usePropId, num: useCostNum })
            }
        }

        // 道具扣减
        if (costArr.length > 0) {
            await Props.costProps(this.user, costArr)
        }
    }

    /**
     * 重组装备池
     * @return void
     */
    rebuildPool(): void {
        // 重组品质随机池
        for (const item of this.poolConf.qualityInfo) {
            // 判断是否需要每次抽重组卡池
            if (!this.needRebuild && item.needTimes > 0) {
                this.needRebuild = true
            }

            // 判断抽取次数是否满足开放品质卡池
            if (item.needTimes > 0 && this.forgePoolItem.times < item.needTimes) {
                continue
            }

            this.rebuildQualityPools.set(item.type, item.pro)
        }

        // 重组装备池
        for (const qualityPool of this.poolConf.lvRange.get(this.lvRangeId).qualityPool) {
            if (!this.rebuildQualityPools.has(qualityPool.type)) {
                continue
            }
            for (const equip of qualityPool.equip) {
                let subPools = this.rebuildPools.get(qualityPool.type)
                if (subPools == null) {
                    subPools = new Map()
                    this.rebuildPools.set(qualityPool.type, subPools)
                }
                subPools.set(equip.equipId, equip.pro)
            }
        }
    }

    /**
     * 执行打造逻辑
     */
    async draw(): Promise<void> {
        // 开始打造
        for (let i = 0; i < this.drawCount; i++) {
            // 随机品质
            const qId = GameRandom.randomByWeight(this.rebuildQualityPools)
            if (qId == null) {
                throw SystemErrors.SysConfErr
            }

            // 品质池校验
            const pools = this.rebuildPools.get(qId)
            if (pools == null) {
                throw SystemErrors.SysConfErr
            }

            // 根据权重随机出来cardId
            this.drawCId = GameRandom.randomByWeight(pools) ?? 0

            // 重置最新卡配置
            this.updateEquipConfig()

            // 保底触发检测
            this.baseAward()

            // 解锁新装备集合
            let forgeEquip = this.forgeEquips.get(this.drawCId)
            if (forgeEquip == null) {
                forgeEquip = { propId: this.drawCId, num: 1 }
                this.forgeEquips.set(this.drawCId, forgeEquip)
            } else {
                forgeEquip.num += 1
            }

            // 累计打造次数
            this.forgePoolItem.times++

            // 跑马灯推送
            this.ledSend()

            // 刷新池
            if (this.needRebuild) {
                this.rebuildPool()
            }
        }

        // 获得新装备
        if (this.forgeEquips.size > 0) {
            // 获得卡
            await Props.addProps(this.user, Array.from(this.forgeEquips.values()), this.pbRes)
        }
    }

    /**
     * 打造后事件触发
     * @return void
     */
    afterEvent(): void {
        // 任务埋点
        // 冲榜活动
    }
    // #endregion

    // #region 辅助方法
    /**
     * 保底逻辑
     * @return void
     */
    baseAward(): void {
        // 开始执行保底逻辑
        for (const [baseQualityQId, qId] of EquipDefine.FORGE_BASE_QUALITY_MAPPING) {
            // 获取保底配置
            const [isOpen, needTimes] = UtilObject.getField(this.poolConf, baseQualityQId)
            if (!isOpen || !needTimes) {
                continue
            }

            // 提前命中保底品质则重置累计次数
            if (this.equipConf?.quality == qId) {
                // 重置保底次数
                this.initQualityBaseData()
                return
            }

            // 次数累计
            let baseItem = this.forgePoolItem.qualityBaseInfo.get(qId)
            if (baseItem == null) {
                baseItem = new ForgeBean({ id: qId, times: 0 })
                this.forgePoolItem.qualityBaseInfo.set(qId, baseItem)
            }
            baseItem.times++

            // 是否命中保底
            if (baseItem.times < needTimes) {
                continue
            }

            // 品质装备随机
            const conf = UtilObject.getField(this.poolConf.lvRange.get(this.lvRangeId), baseQualityQId)
            const randomConf = GameRandom.randomByWeightConfig(conf)
            this.drawCId = (randomConf as any).equipId

            // 刷新装备配置
            this.updateEquipConfig()

            // 重置保底次数
            this.initQualityBaseData()

            return
        }
    }

    /**
     * 重置保底次数
     * @return void
     */
    private initQualityBaseData(): void {
        // 保底计数重置
        for (const [, qId] of EquipDefine.FORGE_BASE_QUALITY_MAPPING) {
            if (this.equipConf!.quality >= qId && this.forgePoolItem.qualityBaseInfo.has(qId)) {
                this.forgePoolItem.qualityBaseInfo.get(qId)!.times = 0
            }
        }
    }

    /**
     * 跑马灯推送
     * @return void
     */
    protected ledSend(): void {
        if (this.equipConf!.quality < EquipDefine.QUALITY_ORANGE) {
            return
        }
        // 跑马灯
    }

    /**
     * 更新当前门客配置
     * @return void
     */
    protected updateEquipConfig(): void {
        this.equipConf = C.equip(this.drawCId)
    }

    /**
     * 品质随机池增加权重
     * @param type
     * @param pro
     * @param overwrite 是否覆盖
     * @returns
     */
    protected qualityPoolsAddPro(type: int, pro: int, overwrite = false) {
        let value = this.rebuildQualityPools.get(type)
        if (value != null) {
            value = value + pro
        } else {
            value = pro
        }
        if (overwrite) {
            value = pro
        }
        this.rebuildQualityPools.set(type, value)
        return value
    }
    // #endregion
}
