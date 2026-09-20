import { v4 as uuidv4 } from 'uuid'
import { User } from '../../user/bean/User'
import { PayClickBean } from '../bean/PayClickBean'
import { PayExtraParams } from './PayCheckoutRules'

export class PayClickFactory {
    static create(user: User, config: IConfRecharge, params: PayExtraParams) {
        const billNumber = uuidv4()
        const click = new PayClickBean(user.id, billNumber)
        click.uId = user.id as int
        click.rechargeId = config.id
        click.activity = params.activityName as string
        click.giftId = params.giftId as int
        click.channel = params.channel as string
        return billNumber
    }
}
