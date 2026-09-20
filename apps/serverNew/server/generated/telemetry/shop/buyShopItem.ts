import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaBuyShopItem } from '../models/TaBuyShopItem'

/**
 * taShop_buyShopItem
 * 事件名:商城购买道具
 * 说明:在商城内购买道具、礼包时推送；
 * 一键购买时不同商品、同商品不同价格需要进行区分
 * @param user User
 */
export function taShop_buyShopItem(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaBuyShopItem()

        // 字段名:商城类型,示例:礼包商城
        obj.shop_type = ''
        // 字段名:商品id,示例:1
        obj.commodity_id = 0
        // 字段名:商品名称,示例:武学礼包
        obj.commodity_name = ''
        // 字段名:购买数量,示例:10
        obj.buy_quantity = 0
        // 字段名:消耗资源,示例:101
        obj.cost_resource = 0
        // 字段名:消耗数量,示例:1000
        obj.cost_num = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
