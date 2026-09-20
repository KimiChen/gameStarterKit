import { User } from '../bean/User'
import { PowerScoreRules } from '../rules/PowerScoreRules'
import { UserFp } from './UserFp'

export class UserMagicWear {
    static unload(user: User) {
        user.gong.magicId = 0
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_MAGIC_WEAR)
    }
}
