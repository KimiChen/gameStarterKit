import { GmAction } from '../../../../gm/http/GmAction'

export abstract class Gift extends GmAction {
    public daoName = 'Gift'

    static readonly RECHARGE_GIFT_TYPE = 5 // recharge配置里的特惠礼包id
}
