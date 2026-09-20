import { User } from '../../user/bean/User'
import { AttrErrors } from '../AttrErrors'
import { AttrModBean } from '../bean/AttrModBean'
import { AttrTypeBean } from '../bean/AttrTypeBean'
import { AttrDefine } from '../rules/AttrDefine'
import { AttributeScale } from '../rules/AttributeScale'

/**
 * 玩家属性计算
 */
export class Attr {
    /**
     * 更新玩家属性
     * @param user
     */
    static updateUserAttr(user: User) {
        const attrMap: Map<int, AttrTypeBean> = new Map()

        // 重算总属性
        user.attr.mods.forEach((mod) => {
            mod.attrs.forEach((modAttr) => {
                // 属性类型
                const type = modAttr.type
                //新值
                let attr = attrMap.get(type)
                if (attr == null) {
                    attr = new AttrTypeBean()
                    attr.type = type
                    attrMap.set(type, attr)
                }
                // 已存在的累加
                attr.val += modAttr.val
            })
        })

        // 重置新的属性列表
        user.attr.attrs.init(this.convertAttr(attrMap))

        // 往场景进程同步战斗属性
    }

    /**
     * 更新模块属性
     * @param user
     * @param attrModId
     * @param attrMap 最新的模块属性信息
     * @param isUpdate
     */
    static updateAttrModItem(user: User, attrModId: int, attrMap: Map<int, AttrTypeBean>, isUpdate = true) {
        // 获取该模块的属性列表
        const attrMod = this.getAttrModItem(user, attrModId)

        for (const [, v] of attrMap) {
            // 属性类型合法性验证
            if (C.attr(v.type) == null) {
                throw AttrErrors.AttrNotExist
            }
        }

        // 重置该模块旧的属性列表
        attrMod.attrs.init(this.convertAttr(attrMap))

        // 重算汇总属性
        isUpdate && this.updateUserAttr(user)
    }

    /**
     * 获取模块属性信息
     * @param user
     * @param arrtModId
     */
    static getAttrModItem(user: User, arrtModId: int) {
        let attrMod = user.attr.mods.get(arrtModId)
        if (attrMod == null) {
            attrMod = new AttrModBean()
            attrMod.id = arrtModId
            user.attr.mods.set(arrtModId, attrMod)
        }
        return attrMod
    }

    /**
     * 转化属性(体力、耐力、力量)
     * @param attrMap
     * @returns
     */
    static convertAttr(attrMap: Map<int, AttrTypeBean>): Map<int, AttrTypeBean> {
        const convertMap = new Map<int, AttrTypeBean>(attrMap.entries())
        for (const [fromAttr, [rate, toAttrType]] of AttrDefine.ConvertAttrs) {
            const fromValue = convertMap.get(fromAttr)
            if (fromValue == null) {
                continue
            }
            let toAttrVal = convertMap.get(toAttrType)
            if (toAttrVal == null) {
                toAttrVal = new AttrTypeBean(toAttrType)
                convertMap.set(toAttrType, toAttrVal)
            }
            toAttrVal.val += (fromValue.val * rate) / AttributeScale.NUMBER_RATIO
        }
        return convertMap
    }

    /**
     * 获取境界提升后的属性列表
     * @param user
     * @param attrs
     */
    static getAttrsRealmUp(user: User, attrs: Map<int, AttrTypeBean>) {
        attrs = this.convertAttr(attrs)

        const realmUpAttrs: Map<int, AttrTypeBean> = new Map()

        for (const [globalType, toType] of AttrDefine.Global_Attr_Types) {
            const addPer = user.attr.attrs.get(globalType)?.val ?? 0
            const attrItem = attrs.get(toType)
            if (attrItem == null) {
                continue
            }
            let toAttr = realmUpAttrs.get(toType)
            if (toAttr == null) {
                toAttr = new AttrTypeBean()
                toAttr.type = toType
                toAttr.val = attrItem.val
                realmUpAttrs.set(toType, toAttr)
            }
            toAttr.val = Math.floor(toAttr.val * (1 + addPer / AttributeScale.NUMBER_RATIO))
        }

        return realmUpAttrs
    }

    /**
     * 境界提升增幅
     * @param user
     * @param originAttrs 原始属性列表
     * @param attrs 增幅属性列表
     */
    static rateRealmUp(user: User, originAttrs: Map<int, AttrTypeBean>, attrs: Map<int, AttrTypeBean>) {
        originAttrs = this.convertAttr(originAttrs)

        for (const [globalType, toType] of AttrDefine.Global_Attr_Types) {
            const addPer = user.attr.attrs.get(globalType)?.val ?? 0
            const originAttr = originAttrs.get(toType)
            if (originAttr == null) {
                continue
            }
            let toAttr = attrs.get(toType)
            if (toAttr == null) {
                toAttr = new AttrTypeBean()
                toAttr.type = toType
                attrs.set(toType, toAttr)
            }
            toAttr.val += Math.floor(originAttr.val * (addPer / AttributeScale.NUMBER_RATIO))
        }
    }
}
