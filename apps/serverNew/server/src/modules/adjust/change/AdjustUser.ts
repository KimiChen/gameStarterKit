import { AdjustOptionCatalog } from '../api/AdjustOptionCatalog'
import { Attr } from '../../attr/calculation/Attr'
import { UserFp } from '../../user/action/UserFp'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { AdjustChange } from './AdjustChange'

export class AdjustUser extends AdjustChange {
    /**
     * 重算玩家评分
     * @group        玩家相关
     * @canCustom
     * @sort         1
     */
    recalFp() {
        PowerScoreRules.FP_MAP.forEach((_, modId) => {
            UserFp.updateUserFp(this.user, modId)
        })
    }

    /**
     * 修改玩家等级
     * @param lv 等级
     * @group 玩家相关
     * @canCustom
     * @sort         12
     */
    editUserLv(lv: int) {
        lv = Number(lv)
        this.user.lv = lv
        return true
    }

    /**
     * 修改玩家属性
     * @param attrType 属性类型
     * {@link AdjustOptionCatalog#getAttrList}
     * @param val      值（固定值/万分比） 不传重置属性
     *
     * @group        玩家相关
     * @canCustom
     * @sort         12
     */
    editAttr(attrType: int, val: int) {
        attrType = Number(attrType)
        val = Number(val)
        if (!val) {
            Attr.updateUserAttr(this.user)
            return
        }
        if (!this.user.attr.attrs.has(attrType)) {
            this.user.attr.attrs.set(attrType, new AttrTypeBean({ type: attrType }))
        }
        this.user.attr.attrs.get(attrType)!.val = val
    }
}
