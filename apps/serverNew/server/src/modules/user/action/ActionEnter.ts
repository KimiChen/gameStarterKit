import { OpenSsl, UtilTime, timestamp } from '@arthropoda/game-engine'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GameEvent } from '../../../runtime/event/GameEvent'
import { MailSendGlobal } from '../../mail/delivery/MailSendGlobal'
import { ServerAvailabilityRules } from '../../serverSettings/runtime/ServerAvailabilityRules'
import { ReqEnter, ResEnter } from '../UserC2S'
import { UserErrors } from '../UserErrors'
import { ChannelLoginProfile } from '../access/ChannelLoginProfile'
import { OpsType } from '../access/OpsType'
import { User } from '../bean/User'
import { UserLoginEventArgs } from '../event/userEvent'
import { UserLoginProfile } from './UserLoginProfile'
import { CopperIncome } from './CopperIncome'
import { initUser, initUserRole } from './userInit'

interface IHash {
    openId: string
    time: int
}

export class ActionEnter extends GameAction {
    async doAction(req: ReqEnter, res: ResEnter) {
        const sId = req.sId

        const hashData: IHash = OpenSsl.decryptOpenssl(req.hash, CP.platform.sessionSignKey)
        if (!hashData || !hashData.openId || sId !== SERVER_ID) {
            throw SystemErrors.SysParamError.params({ vars: [hashData, req] })
        }

        const openId = hashData.openId
        const loginInfo = await UserLoginProfile.load(openId)
        if (typeof loginInfo != 'object' || loginInfo.userId != openId) {
            throw SystemErrors.SysRequestError
        }

        const isOpt = OpsType.isOpt(loginInfo.opsType)
        this.checkGameVersion(req, isOpt)

        //判断是否停服
        const isStop = await ServerAvailabilityRules.checkServerStop(sId)
        if (isStop) {
            // 检测白名单
            if (!OpsType.checkSystem(loginInfo.opsType ?? 0)) {
                throw SystemErrors.ProtectNoMaintain
            }
        }

        let uId: int
        let user: User | undefined
        let initRole: int

        const userModel = await ServerUserModel.findOneBy({ userRegId: openId, userSid: sId })
        if (!userModel) {
            // 非运营账号，判断区服是否已经开了 TODO
            if (!OpsType.checkSystem(loginInfo.opsType ?? 0)) {
                this.checkServerOpen() //判断是否已经开服
                this.checkCreateRole() //检测是否已关闭注册创角
            }
            user = await initUser(openId, sId, loginInfo)
            initRole = 0
            uId = user.id
        } else {
            uId = Number(userModel.userId)
            initRole = userModel.userInitRole

            //更新数据库
            await this.updateUserDbData(userModel, loginInfo)

            user = await User.load(uId)
            if (!user) {
                // 异常用户，数据库已存在，redis不存在
                Log.error(`账号异常:uId=${uId},openId=${openId},sId=${sId},loginInfo=${JSON.stringify(loginInfo)}`)
                throw UserErrors.UserHUserError.params({ vars: { uId: uId } })
            }

            user.activityTime = timestamp()
            user.deviceId = loginInfo.deviceId ?? ''
            user.lineOpenId = loginInfo.lineOpenId ?? ''
        }

        // 绑定
        await Ctx.bind(user.id, user.sId)
        Ctx.user = user

        const now = timestamp()
        const offlineCopper = CopperIncome.settleOffline(user, now)
        // 每日首次登录时间
        if (user.dailyFirstLoginTime < UtilTime.getDayStartTime(now)) {
            user.dailyFirstLoginTime = now
        }

        if (initRole > 0) {
            // 检测全局邮件发送
            await MailSendGlobal.send(user)
            // 登录后记录
            // UserEventLog.whenAfterLogin(user)
        } else {
            // 注册完后记录
            // UserEventLog.whenAfterRegister(user)
        }

        res.initRole = initRole
        res.userId = uId
        // 下发当前服务器时间
        res.nowTime = now
        res.offlineCopperSeconds = offlineCopper.offlineSeconds
        res.offlineCopper = offlineCopper.copper

        //调试环境下自动创角
        if (ADJUST_OPEN && loginInfo.quicklyUser !== undefined) {
            user.name = `账号:${uId}`
            user.race = 1
            await initUserRole(user)
        }

        // await UserEvent.userLogin(user)
        const eventArgs = new UserLoginEventArgs()
        eventArgs.uId = user.id
        eventArgs.time = timestamp()
        await GameEvent.publish(eventArgs)
    }

    /**
     * 更新用户db数据
     * @param userModel
     * @param loginInfo
     */
    async updateUserDbData(userModel: ServerUserModel, loginInfo: ChannelLoginProfile) {
        if (loginInfo.ip !== '') {
            userModel.userIp = loginInfo.ip
        }
        userModel.userActivityTime = timestamp()
        await userModel.save()
    }

    checkGameVersion(req: ReqEnter, isOpt: Boolean) {
        if (isOpt || PLATFORM === 'bearjoy') {
            return
        }

        // const clientVer = req.isReconnect
        // const serverVer = C.version().get('serverVer')
        // if (!serverVer) {
        //     // 没配置，不校验
        //     return
        // }

        // const clientValNum = UtilVersion.getVersionVal(clientVer)
        // const serverValNum = UtilVersion.getVersionVal(serverVer)
        // if (clientValNum < serverValNum) {
        //     throw SystemErrors.ProtectClientNeedDownload
        // }
    }

    /**
     * 判断是否已经开服
     * @returns
     */
    checkServerOpen() {
        return true
    }

    /**
     * 检测是否已关闭注册创角
     * @returns
     */
    checkCreateRole() {
        // 当前区服总人数
        const count = 1
        // 区服玩家人数上限
        const createRoleLimit = 100000
        if (!createRoleLimit) {
            // 没配置的话无注册上限
            return
        }
        if (count >= createRoleLimit) {
            throw SystemErrors.ProtectClosedCreateRole
        }
    }
}
