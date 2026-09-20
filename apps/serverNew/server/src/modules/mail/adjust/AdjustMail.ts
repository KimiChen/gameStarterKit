import { ActionMail } from '../action/ActionMail'
import { AdjustChange } from '../../adjust/change/AdjustChange'
import { AdjustOptionCatalog } from '../../adjust/api/AdjustOptionCatalog'

export class AdjustMail extends AdjustChange {
    /**
     * 添加邮件
     * @param title 邮件标题
     * @param propId 道具id
     * {@link AdjustOptionCatalog#getPropsIdList}
     * @param num    数量>0
     * @param propId2 道具2id(可选)
     * {@link AdjustOptionCatalog#getPropsIdList}
     * @param num2    数量(可选)
     * @group        邮件
     * @canCustom
     */
    async addMail(title: string, propId: int, num: int, propId2: int, num2: int) {
        if (num < 1 || propId < 1) {
            throw Error('propId或者num参数不正确')
        }
        if (num2 > 0 || propId2 > 0) {
            ActionMail.add(
                this.user.id,
                0,
                {},
                [
                    { propId: Number(propId), num: Number(num) },
                    { propId: Number(propId2), num: Number(num2) },
                ],
                title,
                title,
            )
        } else {
            ActionMail.add(this.user.id, 0, {}, [{ propId: Number(propId), num: Number(num) }], title, title)
        }
        await ActionMail.endAction()
    }
}
