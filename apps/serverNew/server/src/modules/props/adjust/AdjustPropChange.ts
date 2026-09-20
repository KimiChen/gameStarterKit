import { AdjustOptionCatalog } from '../../adjust/api/AdjustOptionCatalog'
import { Props } from '../inventory/Props'
import { AdjustChange } from '../../adjust/change/AdjustChange'

export class AdjustPropChange extends AdjustChange {
    /**
     * 扣除道具
     * @param propId 道具id
     * {@link AdjustOptionCatalog#getUserPropsList}
     * @param num    数量>0
     * @group        道具
     * @sort         2
     * @canCustom
     */
    async costProp(propId: int, num: int) {
        propId = Number(propId)
        if (num < 1 || propId < 1) {
            throw Error('propId或者num参数不正确')
        }
        await Props.costProp(this.user, propId, num)
    }

    /**
     * 道具新增
     * @param propId 道具id
     * {@link AdjustOptionCatalog#getPropsIdList}
     * @param num    数量>0
     * @group        道具
     * @sort         1
     * @canCustom
     */
    async addProp(propId: int, num: int) {
        propId = Number(propId)
        if (num < 1 || propId < 1) {
            throw Error('propId或者num参数不正确')
        }
        return Props.addProp(this.user, propId, num)
    }
}
