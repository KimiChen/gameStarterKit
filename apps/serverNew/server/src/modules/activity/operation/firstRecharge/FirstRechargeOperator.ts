import { Activity } from '../../bean/Activity'
import { User } from '../../../user/bean/User'
import { ActivityOperator } from '../ActivityOperator'

export class FirstRechargeOperator extends ActivityOperator {
    public getInfo(user: User, modInfo: Activity): boolean {
        return true
    }
}
