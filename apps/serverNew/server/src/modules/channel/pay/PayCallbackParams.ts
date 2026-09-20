export class PayCallbackParams {
    attach: string = ''

    amount: int = 0

    orderId: string = ''

    uId: int = 0

    //#region attach 透传参数解包内容
    /**
     * 充值档id
     */
    attachRechargeId: int = 0

    /**
     * cp订单号
     */
    attachBillno: string = ''

    /**
     * 礼包id
     */
    attachGiftId: int = 0

    /**
     * 活动名
     */
    attachActivity: string = ''

    /**
     * 角色id
     */
    attachUid: string = ''
    //#endregion

    constructor(attach: string, amount: int, orderId: string, uId: int) {
        this.attach = attach
        this.amount = amount
        this.orderId = orderId
        this.uId = uId
        const arr = attach.split('-')
        this.attachUid = arr[0]
        this.attachRechargeId = Number(arr[1])
        this.attachBillno = arr[2]
        this.attachGiftId = Number(arr[3])
        this.attachActivity = arr[4]
    }
}
