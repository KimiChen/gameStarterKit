import { FeatureAccess } from '../../../modules/user/access/FeatureAccess'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameEvent } from '../../../runtime/event/GameEvent'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { EquipFashion } from '../../equip/inventory/EquipFashion'
import { EquipInventoryStore } from '../../equip/inventory/EquipInventoryStore'
import { EquipDefine } from '../../equip/rules/EquipDefine'
import { UserForbidType } from '../../gm/rules/UserForbidType'
import { MagicBean } from '../../gong/bean/MagicBean'
import { UserErrors } from '../../user/UserErrors'
import { UserFp } from '../../user/action/UserFp'
import { UserMagicWear } from '../../user/action/UserMagicWear'
import { UserPower } from '../../user/action/UserPower'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { WeaponProgression } from '../../weapon/action/WeaponProgression'
import { PropsErrors } from '../PropsErrors'
import { Award } from '../award/Award'
import { PropBean } from '../bean/PropBean'
import { PropChangedEventArgs } from '../event/propEvent'
import { ItemIdDefine } from '../rules/ItemIdDefine'

/**
 * 道具额外信息
 */
export interface PropsExtra {
    reason: string
    practiceEffectIds?: int[] // 装备修炼效果ids
    equipDrawData?: int[] // 抽取装备
}

/**
 * 物品基础模块
 */
export class Props {
    /**
     * 频繁变更的道具，只记录消耗，不记录新增日志
     */
    static readonly noLogTypes: Array<int> = [ItemIdDefine.ITEM_ID_KILL_NUM]

    /** @var int 修炼装备 */
    static readonly EXTRA_DATA_TYPE = 1

    /** @var int 原因 */
    static readonly EXTRA_DATA_REASON = 2

    /** @var int 场景名称 */
    static readonly EXTRA_DATA_SCENE_NAME = 3

    /** @var int 抽取装备 */
    static readonly EXTRA_DATA_DRAW_EQUIP = 4

    private static resolveUserFieldPath(user: User, fieldPath: string) {
        const fieldNames = fieldPath.split('.')
        const fieldName = fieldNames.pop()!
        let fieldOwner: any = user
        for (const parentFieldName of fieldNames) {
            fieldOwner = fieldOwner[parentFieldName]
        }
        return { fieldOwner, fieldName }
    }

    //#region 道具变更

    /**
     * 添加多个道具
     * @param user
     * @param awards
     * @param awardResp 下发组装奖励回复
     * @param merge 是否需要合并道具
     * @param reason
     */
    static async addProps(user: User, awards: PropItem[], awardResp?: AwardResponse, merge = true, reason = '') {
        let l: PropItem[] = []

        //合并重复奖励
        if (merge) {
            awards = Award.mergeSameProps(awards)
        }

        if (awards.length <= 0) {
            return l
        }

        for (const award of awards) {
            const resProps = await this.addProp(user, award.propId, award.num, undefined, { reason: reason })
            l = l.concat(resProps)
        }

        // 需要组装回复协议
        if (awardResp != null) {
            Award.pbAwards2Resp(l, awardResp)
        }

        return l
    }

    /**
     * 添加一个道具
     * @param user
     * @param cId
     * @param num
     * @param extra
     */
    static async addProp(user: User, cId: int, num: int, awardResp?: AwardResponse, extraData?: PropsExtra) {
        if (num <= 0) {
            throw SystemErrors.SysParamError
        }

        if (Math.trunc(cId) !== cId || Math.trunc(num) !== num) {
            throw SystemErrors.SysParamError.vars(['addProp, cId num type must be int', cId, num])
        }

        const propItem: PropItem = { propId: cId, num: num }

        // 特殊处理的道具
        if (cId == ItemIdDefine.ITEM_ID_POWER) {
            UserPower.changeNum(user, num)
        } else if (cId == ItemIdDefine.ITEM_ID_GUILD_EXP) {
            //增加联盟经验
        } else {
            const conf = C.item(cId)
            // 按道具类型处理
            switch (conf.type) {
                case ItemIdDefine.ITEM_TYPE_CURRENCY: //货币
                    this.changeCash(user, cId, num, false)
                    break
                case ItemIdDefine.ITEM_TYPE_COST_ITEM: // 消耗品
                case ItemIdDefine.ITEM_TYPE_MATERIAL: // 材料
                case ItemIdDefine.ITEM_TYPE_GEM: // 符石
                    this.changeProp(user, cId, num, false)
                    break
                case ItemIdDefine.ITEM_TYPE_TREASURE: // 奇珍
                    this.addTreasure(user, cId, num)
                    break
                case ItemIdDefine.ITEM_TYPE_MAGIC: // 神通
                    this.addMagic(user, cId, num)
                    break
                case ItemIdDefine.ITEM_TYPE_FASHION: //时装
                    EquipFashion.addFashion(user, cId, num)
                    break
                case ItemIdDefine.ITEM_TYPE_EQUIPMENT: //装备
                    {
                        const extraEquipData = await EquipInventoryStore.addEquipProp(user, cId, num, extraData)
                        // 装备库新增装备唯一id集合
                        propItem.equip = extraEquipData
                    }
                    break
                case ItemIdDefine.ITEM_TYPE_RARE: // 器灵至宝
                    WeaponProgression.addRare(user, cId, num)
                    break
                case ItemIdDefine.ITEM_TYPE_ONLY_SHOW:
                    // 展示类型物品，不进背包，也不用处理
                    break
                default:
                // throw PropsErrors.PropsNoImpl
            }
        }

        propItem.num = num
        // 需要组装回复协议
        if (awardResp != null) {
            Award.pbAwards2Resp([propItem], awardResp)
        }

        // 添加资源相关事件
        const eventItem = new PropChangedEventArgs()
        eventItem.user = user
        eventItem.response = awardResp
        eventItem.cId = cId
        eventItem.num = num
        eventItem.reason = extraData?.reason ?? ''
        await GameEvent.publish(eventItem)
        // await UserEvent.addProp(user, C.item(cId), num, awardResp)

        return [propItem]
    }

    /**
     * 消耗多个道具
     * @param user
     * @param costProps
     * @param reason
     */
    static async costProps(user: User, costProps: PropItem[], reason = '') {
        if (costProps.length <= 0) {
            throw SystemErrors.SysParamError
        }

        const props = Award.mergeSameProps(costProps)
        for (const prop of props) {
            if (!this.checkPropCount(user, prop.propId, prop.num)) {
                return false
            }
        }

        for (const prop of props) {
            await this.costProp(user, prop.propId, prop.num, reason)
        }

        return true
    }

    /**
     * 消耗道具
     * @param user
     * @param cId
     * @param num 消耗数量，不允许为负数
     * @param reason
     * @returns 返回是否扣道具成功
     */
    static async costProp(user: User, cId: int, num: int, reason = '') {
        if (!this.checkPropCount(user, cId, num)) {
            return false
        }
        if (Math.trunc(cId) !== cId || Math.trunc(num) !== num) {
            throw SystemErrors.SysParamError.vars(['costProp, cId num type must be int', cId, num])
        }
        // 数量变更
        this.changeNum(user, cId, -num)

        return true
    }

    /**
     * 扣除玩家虚拟货币
     * @param user
     * @param cId
     * @param num
     * @param toNegative 是否允许到负数
     */
    private static changeCash(user: User, cId: int, num: int, toNegative = true) {
        if (num < 0) {
            // 虚拟货币扣除，检查相关封禁
            FeatureAccess.checkCostPropForbid(user, cId)
        } else if (cId == ItemIdDefine.ITEM_ID_GC && num >= 100000 && PLATFORM != 'bearjoy') {
            // 防止gc数量异常改变
            throw SystemErrors.SysGcErr
        }

        // 获取货币对应字段名
        const fieldPath = ItemIdDefine.getUserFieldCashMap(cId)
        const { fieldOwner, fieldName } = this.resolveUserFieldPath(user, fieldPath)

        fieldOwner[fieldName] += num
        const afterNum = fieldOwner[fieldName]
        if (!Number.isSafeInteger(afterNum)) {
            throw SystemErrors.SysParamErr.vars([user.id, cId, num])
        }

        // 计算扣除、添加后的数量
        fieldOwner[fieldName] = afterNum

        if (num < 0 && afterNum < 0 && !toNegative) {
            // 无痕操作，并且只允许扣到0
            fieldOwner[fieldName] = 0
        }

        if (!this.noLogTypes.includes(cId)) {
            //TODO:Prop_虚拟货币变更日志
        }
    }

    /**
     * 扣除玩家背包道具
     * @param user
     * @param cId
     * @param num
     * @param toNegative 是否允许扣到负数
     */
    private static changeProp(user: User, cId: int, num: number, toNegative = true) {
        if (num < 0 && FeatureAccess.checkUserForbid(user, UserForbidType.FORBID_PROP)) {
            // 物品使用被禁用
            throw SystemErrors.ForbidBase
        }

        let propItem = user.bag.get(cId)
        if (propItem == null) {
            // 背包不存在，直接创建
            propItem = new PropBean()
            propItem.propId = cId
            propItem.num = num
            user.bag.set(cId, propItem)
        } else {
            // 背包存在，直接扣除
            propItem.num += num
        }

        // 无痕操作不允许扣到负数
        if (num < 0 && propItem.num < 0 && !toNegative) {
            propItem.num = 0
        }

        // 背包道具为0，删除
        if (propItem.num == 0) {
            user.bag.delete(cId)
        }
    }

    /**
     * 修改玩家道具或者虚拟货币的数量
     * @param user
     * @param cId
     * @param num
     * @param toNegative
     * @returns
     */
    private static changeNum(user: User, cId: int, num: number, toNegative = true) {
        if (num == 0) {
            return
        }

        const propConf = C.item(cId)

        switch (propConf.type) {
            case ItemIdDefine.ITEM_TYPE_CURRENCY:
                //货币数量修改
                this.changeCash(user, cId, num, toNegative)
                break
            default:
                //背包数量修改
                this.changeProp(user, cId, num, toNegative)
                break
        }
    }
    //#endregion

    //#region 后台无痕扣除

    /**
     * 无痕操作扣除道具，不检查道具数量，直接扣除，可都出到负数
     * @param user
     * @param costProps
     * @param toNegative  是否可扣到负数
     * @returns
     */
    static reduceProps(user: User, costProps: PropItem[], toNegative = true) {
        if (costProps.length <= 0) {
            return true
        }
        const props = Award.mergeSameProps(costProps)
        for (const prop of props) {
            this.changeNum(user, prop.propId, -prop.num, toNegative)
        }

        return true
    }
    //#endregion

    //#region 道具检查

    /**
     * 检查道具数量是否足够
     */
    static checkPropCount(user: User, cId: int, needNum: int, isThrow = true) {
        const hasNum = this.getHasNum(user, cId)

        //道具不足
        if (needNum > hasNum || needNum <= 0) {
            if (isThrow) {
                throw UserErrors.UserNumIsSmall
            }
            return false
        }

        return true
    }

    /**
     * 获取拥有的道具数量
     */
    static getHasNum(user: User, cId: int) {
        let hasNum: int = 0
        switch (cId) {
            // 特殊的按照ID取对应数量，默认按照道具类型获取
            case ItemIdDefine.ITEM_ID_POWER:
                {
                    hasNum = user.power?.times ?? 0
                }
                break
            default:
                {
                    //默认按照类型取物品数量
                    const propConf = C.item(cId)
                    switch (propConf.type) {
                        case ItemIdDefine.ITEM_TYPE_CURRENCY: // 货币类型
                            {
                                const fieldPath = ItemIdDefine.getUserFieldCashMap(cId)
                                const { fieldOwner, fieldName } = this.resolveUserFieldPath(user, fieldPath)
                                hasNum = fieldOwner[fieldName] ?? 0
                            }
                            break
                        case ItemIdDefine.ITEM_TYPE_RARE: // 至宝
                            {
                                hasNum = user.weapon.rares.get(cId)?.durable ?? 0
                            }
                            break
                        case ItemIdDefine.ITEM_TYPE_MAGIC: // 神通
                            {
                                hasNum = user.gong.magics.get(cId)?.durable ?? 0
                            }
                            break
                        default:
                            {
                                hasNum = user.bag.get(cId)?.num ?? 0
                            }
                            break
                    }
                }
                break
        }
        return hasNum
    }

    //#endregion

    //#region 添加道具扩展

    static addTreasure(user: User, cId: int, num: int) {}

    /**
     * 添加神通
     */
    static addMagic(user: User, cId: int, num: int) {
        // 神通耐久
        const conf = C.gong_magical(cId)
        const durable = conf.durable

        if (!user.gong.magics.has(cId)) {
            user.gong.magics.set(cId, new MagicBean({ magicId: cId, durable: durable }))
            //TODO:改变颜值 User.changeAppearance

            // 更新属性
            Attr.updateAttrModItem(user, AttrModDefine.Magic, AttrDefine.getBaseAttr(conf.baseAttr))

            // 更新评分
            UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_MAGIC_GET)

            num--
        }

        if (num <= 0) return

        // 已拥有转为耐久度
        Props.changeDurable(user, cId, num, ItemIdDefine.DURABLE_FIELD_NAME.magicItems)
    }

    /**
     * 修改耐久
     * @param user
     * @param cId
     * @param num
     * @param field
     */
    static changeDurable(user: User, cId: int, num: int, field: string) {
        switch (field) {
            case ItemIdDefine.DURABLE_FIELD_NAME.magicItems: //神通
                {
                    const magicItem = user.gong.magics.get(cId)
                    if (magicItem == null) {
                        throw PropsErrors.PropsNoHave
                    }
                    magicItem.durable += num
                    if (num > 0) {
                        if (user.gong.magicId == cId) {
                            //同步场景
                        }
                    }
                    // 耐久耗尽处理
                    if (magicItem.durable <= 0) {
                        UserMagicWear.unload(user)
                    }
                }
                break
            case ItemIdDefine.DURABLE_FIELD_NAME.rareItems: //至宝
                {
                    const rareItem = user.weapon.rares.get(cId)
                    if (rareItem == null) {
                        throw PropsErrors.PropsNoHave
                    }
                    rareItem.durable += num
                    if (num > 0) {
                        if (user.weapon.rareId == cId) {
                            // 同步场景
                        }
                    }
                    // 耐久耗尽
                    if (rareItem.durable <= 0) {
                        WeaponProgression.unloadRare(user)
                    }
                }
                break
            case ItemIdDefine.DURABLE_FIELD_NAME.fashionItems: //时装（衣服）
                {
                    const fashionItem = user.fashion.fashions.get(cId)
                    if (fashionItem == null) {
                        throw PropsErrors.PropsNoHave
                    }
                    if (num > 0 && user.fashion.fashionWear.get(EquipDefine.CLOTHES)?.cId == cId) {
                        //同步场景
                    }

                    if (fashionItem.durable <= 0) {
                        EquipFashion.unloadFashion(user, cId)
                        // 时装强度评分更新
                        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_FASHION_WEAR)
                    }
                }
                break
        }
    }
    //#endregion
}
