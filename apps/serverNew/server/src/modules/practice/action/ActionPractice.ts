import { User } from '../../user/bean/User'
import { GameAction } from '../../../runtime/action/GameAction'
import { timestamp } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { PropBean } from '../../props/bean/PropBean'
import { DiffMap } from '@arthropoda/game-engine'
import { SceneActor } from '../../scene/model/SceneActor'
import { SceneActorAssembler } from '../../scene/model/SceneActorAssembler'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { SceneDefine } from '../../scene/rules/SceneDefine'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { EquipEntryGenerator } from '../../equip/inventory/EquipEntryGenerator'
import { EquipInventoryStore } from '../../equip/inventory/EquipInventoryStore'
import { Award } from '../../props/award/Award'
import { AwardBox } from '../../props/award/AwardBox'
import { Props } from '../../props/inventory/Props'
import { EquipPracticeBean } from '../bean/EquipPracticeBean'
import { PracticeBean } from '../bean/PracticeBean'
import { PracticeAwardResult } from './PracticeAwardResult'

export class ActionPractice extends GameAction {
    /** @var int 按照品质检起 */
    public static readonly PICK_UP_TYPE_QUALITY = 1

    /** @var int 按照物品类型捡起 */
    public static readonly PICK_UP_TYPE_PROP_ID = 2

    public static readonly PRACTICE_ID_1001 = 1001

    public static init(user: User) {
        user.practice.practiceId = 1001
        user.practice.practiceNpcLv = 1
        this.getPracticeItem(user)
    }

    public static getPracticeItem(user: User): PracticeBean {
        if (!user.practice.practiceInfo.has(user.practice.practiceId)) {
            user.practice.practiceInfo.set(user.practice.practiceId, new PracticeBean({ id: user.practice.practiceId }))
        }

        return user.practice.practiceInfo.get(user.practice.practiceId)!
    }

    // 结算修炼内收益
    public static settlement(user: User) {
        // TODO: 检测是否解锁离线收益

        const now = timestamp()

        const hangUpMaxTime = Param.PracticeHangUpMaxTime

        // 距离上次结算过了多少时间
        const duringTime = Math.min(now - user.practice.settledPracticeTime, hangUpMaxTime)

        // 可以领取多少分钟的奖励
        const awardTimes = (duringTime / Param.PracticeUnitTime) as int | 0
        if (!awardTimes) {
            return
        }
        // 修改结算时间
        user.practice.settledPracticeTime = now

        // 累计的收益份数已经超过了最大限制
        const max = (hangUpMaxTime / UtilTime.MINUTE_SECOND) as int
        if (user.practice.settledNum >= max) {
            return
        }

        // 结算时间收益
        const awards: PropBean[] = []
        const practiceConf = C.practice(user.practice.practiceId)
        practiceConf.wait.forEach((conf) => {
            const propId = conf.propId
            // 特权卡额外经验
            //if(propId === ItemIdDefine.ITEM_ID_EXP && Tq)
            awards.push(new PropBean({ propId: propId, num: conf.num }))
        })
        // 将结算放到玩家身上,等待玩家领取
        Award.mergeAwards(user.practice.hangUpAwards.copy(), awards)
        // 累计结算了多少分钟的奖励
        user.practice.settledNum += awardTimes
    }

    public static killedToNpcAwards(awards: DiffMap<int, PropBean>, appendAwards: Map<int, PropBean>) {
        if (appendAwards.size <= 0) {
            return
        }
        appendAwards.forEach((item) => {
            if (item.propId === 0 || item.num === 0) {
                return
            }
            if (!awards.has(item.propId)) {
                awards.set(item.propId, new PropBean({ propId: item.propId, num: item.num, data: item.data }))
            } else {
                const prop = awards.get(item.propId)!
                prop.num += item.num
                const extraData = new Map<string, any>()
                const itemData = JSON.parse(item.data)
                const oriData = JSON.parse(prop.data)
                if (itemData[EquipInventoryStore.DATA_LABEL_PRACTICE] !== undefined) {
                    for (const key in oriData[EquipInventoryStore.DATA_LABEL_PRACTICE]) {
                        extraData.set(key, oriData[EquipInventoryStore.DATA_LABEL_PRACTICE][key])
                    }
                    for (const key in itemData[EquipInventoryStore.DATA_LABEL_PRACTICE]) {
                        extraData.set(key, itemData[EquipInventoryStore.DATA_LABEL_PRACTICE][key])
                    }
                }
                const ser = new Map<int, Map<string, any>>()
                ser.set(EquipInventoryStore.DATA_LABEL_PRACTICE, extraData)
                prop.data = JSON.stringify(ser)
            }
        })
    }

    /**
     * 通过挂机时间获取挂机杀敌数
     * @param  user
     * @param  time
     * @return int
     */
    public static getKilledNumByHangUpTime(user: User, time: int) {
        // 1001 地图不给杀敌数
        if (user.practice.practiceId === this.PRACTICE_ID_1001) {
            return 0
        }
        // 根据玩家属性，评估出结算人头收益
        const atkActor = new SceneActor()
        SceneActorAssembler.fromUser(user, atkActor, ModuleOpenType.SYS_PRACTICE, 0)

        // 怪物
        const PracticeConf = C.practice(user.practice.practiceId)
        const monsterId = PracticeConf.littleMonster[0].monsterId
        const monsterConf = C.monster(monsterId)
        const monsterActor = new SceneActor()
        monsterActor.monsterToActor(ModuleOpenType.SYS_PRACTICE, 1, 1, monsterConf)
        // 模拟一分钟的杀敌情况
        const simulationRound = 60 * (1000 / Param.UserInitSpeed)
        let killNum = 0
        const atkFightAttr = atkActor.fightAttr
        const atk = atkFightAttr.atk * (1 + atkFightAttr.hurt / AttributeScale.NUMBER_RATIO)
        const critRate =
            (atkFightAttr.crit / AttributeScale.NUMBER_RATIO) *
                ((atkFightAttr.critDamage + SceneDefine.CRIT_DAMAGE_BASE) / AttributeScale.NUMBER_RATIO - 1) +
            1
        for (let round = 1; round <= simulationRound; round++) {
            const damage = atk * critRate
            monsterActor.leftHp -= damage

            if (monsterActor.leftHp <= 0) {
                // 增加杀敌数
                killNum++

                // 恢复血量
                monsterActor.leftHp = monsterActor.oriAttr.hp
            }
        }
        return ((time * killNum) / 60) as int
    }

    public static getKilledAwardsByKilledNum(user: User, killNum: int, dailyOutputLimit: boolean = false) {
        const practiceConf = C.practice(user.practice.practiceId)
        const awards = new Array<IConfPracticeLittleMonsterAward2>()
        if (practiceConf.littleMonsterAward2.length == 0) {
            return awards
        }
        for (let i = 0; i < killNum; i++) {
            const idx = -1
            const award = GameRandom.randomByWeightConfig(practiceConf.littleMonsterAward2)
            if (dailyOutputLimit) {
                // 需要日产出限制
                const itemConf = C.item(award.propId)
                const qualityLimit = 'PracticeDropLimit' + itemConf.quality
                let outputNum = user.practice.practiceBoxLimit.get(itemConf.quality)
                if (outputNum !== undefined) {
                    outputNum += award.num
                } else {
                    outputNum = award.num
                }

                let limit = 0
                switch (qualityLimit) {
                    case 'PracticeDropLimit1': {
                        limit = Param.PracticeDropLimit1
                        break
                    }
                    case 'PracticeDropLimit2': {
                        limit = Param.PracticeDropLimit2
                        break
                    }
                    case 'PracticeDropLimit3': {
                        limit = Param.PracticeDropLimit3
                        break
                    }
                    case 'PracticeDropLimit4': {
                        limit = Param.PracticeDropLimit4
                        break
                    }
                    case 'PracticeDropLimit6': {
                        limit = Param.PracticeDropLimit6
                        break
                    }
                    case 'PracticeDropLimit8': {
                        limit = Param.PracticeDropLimit8
                        break
                    }
                }
                if (outputNum > limit) {
                    continue
                }
                // 增加产出限制
                const num = user.practice.practiceBoxLimit.get(itemConf.quality)
                if (num !== undefined) {
                    user.practice.practiceBoxLimit.set(itemConf.quality, num + award.num)
                } else {
                    user.practice.practiceBoxLimit.set(itemConf.quality, award.num)
                }
            }
            awards.push(award)
        }
        return awards
    }

    public static addKilledAwards(
        user: User,
        practiceItem: PracticeBean,
        awardItems: Array<IConfPracticeLittleMonsterAward2>,
        res?: PracticeAwardResult,
    ) {
        for (const awardItem of awardItems) {
            const item = new PropBean({ propId: awardItem.propId, num: awardItem.num })
            if (item.propId === 0 || awardItem.num === 0) {
                return
            }
            // 物品配置判断是否为装备类型,非装备直接入库
            const itemConf = C.item(awardItem.propId)
            if (itemConf.type !== ItemIdDefine.ITEM_TYPE_EQUIPMENT) {
                const awards = practiceItem.killedAwards.copy()
                Award.mergeAwards(awards, [awardItem])
                practiceItem.killedAwards.init(awards)
                if (res !== undefined) {
                    Award.pbAwards2Resp([awardItem], res.award)
                }
                continue
            }
            // 装备配置
            const equipConf = C.equip(awardItem.propId)
            // 随机修炼装备效果
            const extraData = new Map<int, int>()
            for (let i = 0; i < awardItem.num; i++) {
                const effects = EquipEntryGenerator.randomEffects(equipConf)
                if (effects.length > 0) {
                    const practiceEquip = new EquipPracticeBean()
                    practiceEquip.effects.init(new Array<int>())
                    user.practice.practiceEquips.set(user.practice.practiceEquips.size(), practiceEquip)
                    extraData.set(practiceEquip.id, practiceEquip.id)
                }
            }
            const data = new Map<int, Map<int, int>>()
            data.set(EquipInventoryStore.DATA_LABEL_PRACTICE, extraData)
            item.data = JSON.stringify(data)

            if (!practiceItem.killedAwards.has(item.propId)) {
                practiceItem.killedAwards.set(item.propId, item)
            } else {
                const extra = new Map<string, any>()
                const killedData = practiceItem.killedAwards.get(item.propId)?.data
                if (killedData !== undefined) {
                    const oriData = JSON.parse(killedData)
                    for (const oriDataKey in oriData[EquipInventoryStore.DATA_LABEL_PRACTICE]) {
                        const value = oriData[EquipInventoryStore.DATA_LABEL_PRACTICE][oriDataKey]
                        extra.set(oriDataKey, value)
                    }
                }
                // 效果库更新
                const strfy = new Map<int, Map<string, any>>()
                strfy.set(EquipInventoryStore.DATA_LABEL_PRACTICE, extra)
                practiceItem.killedAwards.get(item.propId)!.data = JSON.stringify(strfy)
                // 数量添加
                practiceItem.killedAwards.get(item.propId)!.num += item.num
            }
            if (res) {
                Award.pbAwards2Resp([item], res.award)
            }
        }
    }

    public static async batchOpenBox(
        user: User,
        awards: DiffMap<int, PropBean>,
        res: AwardResponse,
        quality: int = 0,
    ): Promise<void> {
        for (const [, award] of awards) {
            const propId = award.propId
            let num = award.num
            const itemConf = C.item(propId)

            // 装备宝箱类型跳过
            if (itemConf.type === ItemIdDefine.ITEM_TYPE_EQUIPMENT) {
                // 计算还能领取多少件
                let canAddNum = Param.EquipNumMax - EquipInventoryStore.getEquipNum(user)
                if (!canAddNum) {
                    return
                }
                canAddNum = Math.min(num, canAddNum)
                award.num -= canAddNum
                num = canAddNum
            }
            await Props.addProp(user, propId, num, res)
            if (award.num <= 0) {
                awards.delete(propId)
            }
        }
        // 按品质从高到地排序
        const npcAwards = awards.values()
        npcAwards.sort(function (a: PropBean, b: PropBean): number {
            const aConf = C.item(a.propId)
            const bConf = C.item(b.propId)
            return aConf.quality - bConf.quality
        })

        // 开启宝箱
        for (const box of npcAwards) {
            const boxId = box.propId
            const itemConf = C.item(boxId)
            // 上面还有可能还有装备没领取完，这边要过滤掉非宝箱类型的道具
            if (itemConf.type !== ItemIdDefine.ITEM_TYPE_BOX) {
                continue
            }
            // 按品质开启
            if (quality && itemConf.quality > quality) {
                continue
            }
            const boxNum = box.num
            for (let i = 0; i < boxNum; i++) {
                if (EquipInventoryStore.getEquipNum(user) >= Param.EquipNumMax) {
                    return
                }
                // 每一件宝箱都随机
                const equipAwards = AwardBox.openBoxAward(C.item_box(boxId))
                box.num--
                await Props.addProps(user, equipAwards, res)
            }
            awards.delete(boxId)
        }
    }

    /**
     * 处理修炼装备相关操作,返回效果
     * @param user
     * @param prop
     * @param targetId 目标效果库id，也可以用来判断需要效果概率获得
     */
    public static getPracticeEquipEffects(user: User, prop: PropBean, targetId: int = 0) {
        if (prop.data === '') {
            return undefined
        }

        // 解析奖励
        const propDataInfo = JSON.parse(prop.data)
        // 判断是否存在修炼装备特效
        if (propDataInfo[EquipInventoryStore.DATA_LABEL_PRACTICE] === undefined) {
            return undefined
        }

        let randomDo = true

        if (!targetId && prop.num > propDataInfo[EquipInventoryStore.DATA_LABEL_PRACTICE].size) {
            randomDo = GameRandom.getProbability(5000)
        }

        if (!randomDo) {
            return undefined
        }

        // 获取效果
        let practiceEquipId = 0
        if (targetId) {
            practiceEquipId = targetId
            propDataInfo[EquipInventoryStore.DATA_LABEL_PRACTICE].delete(targetId)
        } else {
            practiceEquipId = propDataInfo[EquipInventoryStore.DATA_LABEL_PRACTICE].pop()
        }
        const effects = user.practice.practiceEquips.get(practiceEquipId)?.effects.copy()

        user.practice.practiceEquips.delete(practiceEquipId)

        prop.data = JSON.stringify(propDataInfo)

        return effects
    }

    /**
     * 通过记录的sort值获取当前章
     * @param sort
     * @returns
     */
    static getChapterIdOfSort(sort: number): number {
        return Int(sort / 1000)
    }
}
