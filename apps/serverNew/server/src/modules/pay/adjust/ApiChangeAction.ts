import { AdjustOptionCatalog } from '../../adjust/api/AdjustOptionCatalog'
import { PayClickBean } from '../bean/PayClickBean'
import { AdjustChange } from '../../adjust/change/AdjustChange'
import { PaymentCallback } from '../http/callback/PaymentCallback'

export class ApiChangeAction extends AdjustChange {
    /**
     * 充值
     * @param billNo 订单号
     * {@link AdjustOptionCatalog#payList}
     * @group        充值
     * @canCustom
     */
    public async pay(billNo: string) {
        const clickInfo = await PayClickBean.load(String(this.user.id), billNo)
        if (!clickInfo) {
            return { code: 1, msg: 'clickInfo不存在' }
        }
        if (clickInfo.uId != this.user.id) {
            return { code: 1, msg: 'uId不匹配' }
        }
        const orderConf = C.recharge(clickInfo.rechargeId)
        const res = await new PaymentCallback().notice(
            clickInfo.uId,
            orderConf.id,
            String(clickInfo.id),
            String(clickInfo.id),
            orderConf.recharge,
            '1',
            clickInfo.giftId,
            clickInfo.activity,
        )

        if (res) {
            return { code: 0, msg: '' }
        } else {
            return { code: 1, msg: '执行PayNoticeService出错，可在错误日志中查看报错' }
        }
    }
}
