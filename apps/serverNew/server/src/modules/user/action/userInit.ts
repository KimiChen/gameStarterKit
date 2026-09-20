import { UtilTime, timestamp } from '@arthropoda/game-engine'
import { CenterUserModel } from '../../../../generated/persistence/CenterUserModel'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { GameIdGenerator } from '../../../runtime/identity/GameIdGenerator'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { ActionPractice } from '../../practice/action/ActionPractice'
import { UserErrors } from '../UserErrors'
import { ChannelLoginProfile } from '../access/ChannelLoginProfile'
import { User } from '../bean/User'
import { PowerScoreRules } from '../rules/PowerScoreRules'
import { UserEvent } from './UserEvent'
import { UserFp } from './UserFp'
import { UserPower } from './UserPower'

/**
 * 注册玩家
 */
export async function initUser(openId: string, sId: int, loginInfo: ChannelLoginProfile) {
    const ip = loginInfo.ip ?? ''

    const centerUser = await CenterUserModel.findOneBy({ openId: openId })
    if (!centerUser || centerUser.openId != openId) {
        throw UserErrors.UserLoginFail
    }
    const spid = centerUser.userSpid ?? '0'
    const deviceId = centerUser.deviceId ?? ''
    const now = timestamp()
    const uId = await GameIdGenerator.getUserId(sId)

    const userModel = ServerUserModel.create()
    userModel.userId = String(uId)
    userModel.userRegId = openId
    userModel.userName = ''
    userModel.userInitTime = now
    userModel.userLoginDays = 1
    userModel.userActivityTime = now
    userModel.userSid = sId
    userModel.userInitRole = 0
    userModel.userIp = ip
    userModel.userGc = '0'
    userModel.userRegIp = ip

    await userModel.save()

    // await queryRunner.manager.save(userModel)

    // const uId = userModel.userId
    if (!uId) {
        // await queryRunner.rollbackTransaction()
        throw UserErrors.UserLoginFail.params({ vars: [uId, sId] })
    }
    centerUser.userId = String(uId)
    await centerUser.save()
    // await queryRunner.manager.save(centerUser)

    let user = await User.load(uId)
    if (user) {
        // await queryRunner.rollbackTransaction()
        throw UserErrors.UserLoginFail.params({ vars: [uId, sId] })
    }
    user = new User(uId)
    // user.id = uId
    // user.name = ''
    // user.activityTime = now
    // user.loginDays = 1
    // user.sId = sId
    // user.deviceId = deviceId
    // user.gc = 1000
    // user.lv = 30
    // user.race = 1
    // user.realm = 1
    // user.nextDayTime = UtilTime.getCurrentResetTime()
    // user.openid = openId
    // user.initTime = now
    // user.spid = spid
    // user.hero = new HeroBean({ hId: 1001, lv: 1 })
    // user.attr = new UserAttrBean()
    user.id = uId
    user.name = ''
    user.openid = openId
    user.initTime = now
    user.activityTime = now
    user.nextDayTime = UtilTime.getCurrentResetTime()
    user.loginDays = 1
    user.sId = sId
    user.spid = spid
    user.deviceId = deviceId
    // user.mainTaskId = 1
    user.lineOpenId = loginInfo.lineOpenId ?? ''

    await user.save()

    // await queryRunner.commitTransaction()

    return user
}

/**
 * 创建角色
 */
export async function initUserRole(user: User) {
    user.lv = 1
    user.realm = 1

    // 默认初始化第一个练功场
    ActionPractice.init(user)

    // 初始化体力
    UserPower.initPower(user)

    // 评分更新
    UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_LV)

    // 初始功速(换算毫秒值)
    const arrtItem = new AttrTypeBean()
    arrtItem.type = AttrDefine.Speed
    arrtItem.val = Param.UserInitSpeed
    Attr.updateAttrModItem(user, AttrModDefine.InitRole, new Map([[AttrDefine.Speed, arrtItem]]))

    // 初始化妖术列表
    user.gong.sorceryList.init(C.race(user.race).gongSorceryId)

    // 玩家等级升级属性计算等
    await UserEvent.userLevelUp(user, user.lv)

    // npc次数领取
    // ActionPractice.getNpcTimes(user)
}
