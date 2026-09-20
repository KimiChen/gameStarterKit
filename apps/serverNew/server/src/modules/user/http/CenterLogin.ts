import { OpenSsl, RedisInstance, getHttpReqClientIp, timestamp } from '@arthropoda/game-engine'
import { Request } from 'express'
import { Service } from 'typedi'
import { CenterUserModel } from '../../../../generated/persistence/CenterUserModel'
import { DeviceWhiteModel } from '../../../../generated/persistence/DeviceWhiteModel'
import { GmLoginUserListModel } from '../../../../generated/persistence/GmLoginUserListModel'
import { OpsUserModel } from '../../../../generated/persistence/OpsUserModel'
import { UserErrors } from '../UserErrors'
import { ChannelLoginProfile } from '../access/ChannelLoginProfile'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ChannelRegistry } from '../../channel/ChannelRegistry'
import { ChannelUser } from '../../channel/ChannelUser'
import { ServerListCatalog } from '../../serverSettings/http/ServerListCatalog'
import { UserServerDirectory } from '../../serverSettings/center/UserServerDirectory'
import { UserLoginQuery, UserLoginResponse } from './UserLoginQuery'

const saveFields: { [key: string]: string } = {
    deviceId: 'deviceId',
    deviceModel: 'device_model',
    netType: 'netType',
    deviceOS: 'os',
    systemVersion: 'osVersion',
    idfa: 'idfa',
    resVer: 'clientVer',
    loginType: 'loginType',
}

@Service()
export class CenterLogin {
    async login(query: UserLoginQuery, request: Request): Promise<UserLoginResponse> {
        const ip = getHttpReqClientIp(request)
        const channelUser = await this.getLoginInfo(query.loginType, query)
        const deviceType = this.getDeviceType(query.os)
        const openId = channelUser.userId

        await this.checkWhiteDevice(ip, query.deviceId)
        const user = await this.saveUser(openId, this.getSpid(channelUser), query.deviceId, deviceType)
        await this.saveLoginInfo(request.query, openId, channelUser, ip, query.deviceId, query.quicklyUser, user)

        return {
            s: 0,
            ul: [],
            openId,
            al: await new ServerListCatalog().getList(openId),
            isNew: user.isNew,
            h: this.getLoginToken(openId, query.loginType, user.isNew, false, user.isCertificate),
            centerId: user.centerId,
        }
    }

    async gmLogin(query: UserLoginQuery, request: Request): Promise<UserLoginResponse> {
        const ip = getHttpReqClientIp(request)
        const channelUser = await this.getGMLoginInfo(query)
        const openId = channelUser.userId
        await this.saveGMLoginInfo(channelUser, openId, ip, query.deviceId ?? '')

        return {
            s: 0,
            ul: await UserServerDirectory.getUserServers(openId),
            al: await new ServerListCatalog().getList(openId),
            openId,
            isNew: false,
            h: this.getLoginToken(openId, query.loginType, false, false, 0),
            centerId: 0,
        }
    }

    /**
     * 用户的渠道id
     * @param channelUser
     * @returns
     */
    getSpid(channelUser: ChannelUser) {
        return channelUser.channelId ? channelUser.channelId : '999999'
    }

    /**
     * 识别设备类型
     * @param os 类型
     * @returns IdType
     */
    getDeviceType(os: string) {
        os = os.toLocaleLowerCase()
        switch (os) {
            case 'ios':
                return 1
            case 'android':
                return 2
            default:
                return 0
        }
    }

    /**
     * 获取登录信息
     * @param loginType
     * @param loginParams
     * @returns
     */
    async getLoginInfo(loginType: string, loginParams: { [k: string]: any }) {
        const channelObj = ChannelRegistry.getObj(loginType)
        const channelUser = await channelObj.login(loginParams)
        if (!channelUser || !channelUser.userId) {
            throw UserErrors.UserLoginFail.params({ vars: { params: loginParams } })
        }
        return channelUser
    }

    /**
     * 获取GM登录信息
     * @param loginParams
     * @returns
     */
    async getGMLoginInfo(loginParams: { [k: string]: any }) {
        // 判断用户登录
        const loginOpenId = loginParams.loginUser ?? ''
        const loginSecret = loginParams.loginSecret ?? ''
        if (!loginOpenId || !loginSecret) {
            throw UserErrors.UserLoginFail.vars(loginParams)
        }
        const rowUser = await GmLoginUserListModel.findOneBy({ openId: loginOpenId })
        if (!rowUser || rowUser.createTime < timestamp() - 600) {
            throw UserErrors.UserLoginFail.vars(loginParams)
        }
        const dbSecret = OpenSsl.decryptOnlyOpenssl(rowUser.loginSecret, rowUser.loginSalt)
        if (!dbSecret || loginSecret != dbSecret) {
            throw UserErrors.UserLoginFail.vars(loginParams)
        }

        const centerUser = await CenterUserModel.findOneBy({ openId: loginOpenId })
        if (!centerUser) {
            throw UserErrors.UserLoginFail.vars(loginParams)
        }

        return new ChannelUser(centerUser.openId, '')
    }

    /**
     * 检查设备白名单
     * @param clientIp
     * @param deviceId
     * @returns
     */
    async checkWhiteDevice(clientIp: string, deviceId: string) {
        const whiteDeviceSwitch = CP.platform.whiteDeviceSwitch ?? false
        if (!whiteDeviceSwitch) {
            return true
        }
        if (CA.open_ip.ips.includes(clientIp)) {
            return true
        }
        if (!deviceId) {
            throw SystemErrors.SysForbidDevice.params({ vars: { deviceId: '' } })
        }
        const row = await DeviceWhiteModel.findOneBy({ deviceId: deviceId })

        if (!row || row.deviceId != deviceId) {
            throw SystemErrors.SysForbidDevice.params({ vars: { deviceId: '' } })
        }
        return true
    }

    /**
     * 保存用户信息
     * @param openId 用户的唯一标识
     * @param spId 用户的渠道ID
     * @param deviceId 用户的设备ID
     * @param deviceType 用户的设备类型
     * @returns 返回保存的用户信息
     */
    async saveUser(openId: string, spId: string, deviceId: string, deviceType: int) {
        let user = await CenterUserModel.findOneBy({ openId: openId })

        let isNew: boolean = false
        let userOpsType = 0
        if (!user) {
            user = CenterUserModel.create()
            user.openId = openId
            user.userSpid = spId
            user.userInitTime = timestamp()
            user.userId = String(0)
            user.deviceType = deviceType
            user.deviceId = deviceId
            user.isCertificate = 0
            await user.save()
            isNew = true
        } else {
            if (deviceId && deviceId != user.deviceId) {
                user.deviceType = deviceType
                user.deviceId = deviceId
                await user.save()
            }
            // 运营账号
            const opsUser = await OpsUserModel.findOneBy({ openId: openId, status: 1 })
            if (opsUser) {
                userOpsType = opsUser.opsType
            }
        }

        return {
            isPay: user.userMoney > 0,
            isNew: isNew,
            centerId: user.id,
            userOpsType: userOpsType,
            isCertificate: user.isCertificate,
        }
    }

    /**
     * 保存登录信息
     */
    async saveLoginInfo(
        loginParams: any,
        openId: string,
        channelUser: ChannelUser,
        clientIp: string,
        deviceId: string,
        isQuicklyUser: string,
        dataInfo: any,
    ) {
        const channelUserInfo: ChannelLoginProfile = {
            userId: channelUser.userId,
            userName: channelUser.userName,
            channelId: channelUser.channelId,
            ip: clientIp,
            deviceId: deviceId,
            opsType: dataInfo.userOpsType,
            isPay: dataInfo.isPay,
            device_model: '',
            netType: '',
            os: '',
            osVersion: '',
            idfa: '',
            clientVer: '',
            loginType: '',
        }
        if (isQuicklyUser) {
            channelUserInfo.quicklyUser = isQuicklyUser
        }

        //添加设备等信息
        for (const cField in saveFields) {
            const field = saveFields[cField]
            //@ts-ignore channelUserInfo里的字段类型有 number也有string导致交叉后未nerver, 类型标注实在难写
            channelUserInfo[field] = loginParams[cField] ?? ''
        }

        if (loginParams.deviceBrand) {
            channelUserInfo.osVersion = loginParams.deviceBrand + ' ' + channelUserInfo.osVersion
        }
        if (loginParams.androidVersion) {
            channelUserInfo.osVersion = 'Android ' + loginParams.androidVersion
        }

        const redis = RedisInstance.getCenterRedis()
        await redis.set(openId + '_login', JSON.stringify(channelUserInfo), 3 * 86400)

        return channelUserInfo
    }

    /**
     * 保存GM登录信息
     */
    async saveGMLoginInfo(channelUser: ChannelUser, openId: string, ip: string, deviceId: string) {
        const channelUserInfo: ChannelLoginProfile = {
            userId: channelUser.userId,
            userName: channelUser.userName,
            channelId: channelUser.channelId,
            ip: ip,
            deviceId: deviceId,
            opsType: 0,
            isPay: 0,
            device_model: '',
            netType: '',
            os: '',
            osVersion: '',
            idfa: '',
            clientVer: '',
            loginType: '',
            gmLogin: 1,
        }

        const redis = RedisInstance.getCenterRedis()
        await redis.set(openId + '_login', JSON.stringify(channelUserInfo), 3 * 86400)

        return channelUserInfo
    }

    /**
     * 获取登录token
     */
    getLoginToken(openId: string, loginType: string, isNew: boolean, isShen: boolean, isCertificate: int) {
        const loginData: { [k: string]: string | int } = {
            openId: openId,
            time: timestamp(),
            loginType: loginType,
            shen: isShen ? 1 : 0,
            isNew: isNew ? 1 : 0,
            isCertificate: isCertificate ? 1 : 0,
        }

        return OpenSsl.encryptOpenssl(loginData, CP.platform.sessionSignKey)
    }
}
