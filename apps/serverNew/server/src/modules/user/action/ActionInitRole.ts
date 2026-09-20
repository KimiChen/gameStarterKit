import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { MailSendGlobal } from '../../mail/delivery/MailSendGlobal'
import { ReqInitRole } from '../UserC2S'
import { UserErrors } from '../UserErrors'
import { initUserRole } from './userInit'

// 性别男
const SEX_MALE = 1
// 性别女
const SEX_FEMALE = 2

/**
 * 创角色
 */
export class ActionInitRole extends GameAction {
    async doAction(req: ReqInitRole, res: ResDefault) {
        const uId = this.user.id
        const name = req.name.trim()
        const raceId = req.raceId
        const sex = req.sex === SEX_MALE ? SEX_MALE : SEX_FEMALE

        const userModel = await ServerUserModel.findOneBy({ userId: String(uId) })
        if (!userModel) {
            throw UserErrors.UserNoUser
        }
        if (userModel.userInitRole > 0) {
            throw SystemErrors.SysRequestError
        }

        // User.checkName(name, this.user)
        // User.checkAndLockUserName(name)

        userModel.userInitRole = 1
        userModel.userLevel = 1
        userModel.userName = name
        await userModel.save()

        // 初始化用户数据
        this.user.name = name
        this.user.sex = sex
        this.user.race = raceId

        await initUserRole(this.user)

        // 检测全局邮件发送
        await MailSendGlobal.send(this.user)
    }
}
