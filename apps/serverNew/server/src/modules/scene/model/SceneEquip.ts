import { EquipPropBean } from '../../equip/bean/EquipPropBean'

export class SceneEquip {
    // #region 参数-基础属性
    /** Id */
    id: int = 0

    /** 配表id */
    cId: int = 0

    /** 耐久 */
    durable: int = 0

    /** 效果 */
    effects: number[] = []
    // #endregion

    // #region 对象转换
    /** 转model */
    toModel(propItem: EquipPropBean) {
        this.id = propItem.id
        this.cId = propItem.cId
        this.durable = propItem.durable
        for (const effectId of propItem.effects) {
            this.effects.push(effectId)
        }
    }
    // #endregion
}
