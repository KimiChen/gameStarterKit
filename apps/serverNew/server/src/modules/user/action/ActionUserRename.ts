import { RedisLock } from '@arthropoda/game-engine'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { ReqUserRename } from '../UserS2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { UserErrors } from '../UserErrors'
import { User } from '../bean/User'
import { UserAccountKeys } from '../rules/UserAccountKeys'
/**
 * gmapi-强制玩家改名
 */
export class ActionUserRename extends GameAction {
    async doAction(req: ReqUserRename, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            return
        }
        const name = req.name.trim()
        if (name == user.name) {
            return
        }

        const exist = await ServerUserModel.existsBy({ userName: name })
        if (exist) {
            throw UserErrors.UserNameSame
        }

        const locked = await RedisLock.create(UserAccountKeys.USER_NAME_LOCK_KEY + name).lock()
        if (!locked) {
            throw UserErrors.UserNameSame
        }

        user.name = name
        const userModel = await ServerUserModel.findOneBy({ userId: String(user.id) })
        userModel!.userName = name
        await userModel!.save()
    }
}
