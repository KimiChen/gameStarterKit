import { GameError, UtilTime, array_unique, getServerIdByUid, timestamp } from '@arthropoda/game-engine'
import { In } from '@arthropoda/typeorm'
import { CenterUserModel } from '../../../../../generated/persistence/CenterUserModel'
import { ServerUserModel } from '../../../../../generated/persistence/ServerUserModel'
import { UserForbidModel } from '../../../../../generated/persistence/UserForbidModel'
import { ActionGmUserForbid } from '../../action/ActionGmUserForbid'
import { IUserServerRole, UserServerDirectory } from '../../../serverSettings/center/UserServerDirectory'
import { QueuedLocalAction as QueueAction } from '../../../../runtime/action/QueuedLocalAction'
import { SystemErrors } from '../../../../runtime/errors/SystemErrors'
import { GmAction } from '../GmAction'

export abstract class Banned extends GmAction {
    static readonly TYPE_ROLE = 1

    static readonly TYPE_USER = 2

    static readonly TYPE_DEVICE = 3

    static readonly ACCOUNT_TYPE: Record<string, number | undefined> = {
        role: this.TYPE_ROLE,
        user: this.TYPE_USER,
        device: this.TYPE_DEVICE,
    }

    static readonly TYPE_MESSAGE: Record<number, string | undefined> = {
        [this.TYPE_ROLE]: '不存在的角色',
        [this.TYPE_USER]: '不存在的账号',
        [this.TYPE_DEVICE]: '不存在的设备号',
    }

    static readonly FORBID_CHAT = 1 //禁言

    static readonly FORBID_ACCOUNT = 2 //封号

    static readonly ACVITE_TIME = 43200 //半天内算活跃

    public async pushForbidMsg(account: number | string, accountType: int, type: int, forbid: boolean, endTime = -1) {
        switch (accountType) {
            case Banned.TYPE_ROLE:
                {
                    account = Int(account)
                    const sId = getServerIdByUid(account)
                    await QueueAction.rpc(
                        ActionGmUserForbid,
                        {
                            uId: account,
                            type: type,
                            forbid: !!forbid,
                            time: endTime,
                        },
                        account,
                        sId,
                    )
                }

                break
            case Banned.TYPE_USER: //账号
                {
                    account = String(account)
                    const userServers = await UserServerDirectory.getUserServers(account)
                    await this.pushByUserData(userServers, type, forbid, endTime)
                }
                break
            case Banned.TYPE_DEVICE: //设备
                {
                    account = String(account)
                    const user = await CenterUserModel.findOneBy({ deviceId: account })
                    if (user) {
                        const userServers = await UserServerDirectory.getUserServers(user.openId)
                        await this.pushByUserData(userServers, type, forbid, endTime)
                    }
                }
                break
        }
    }

    private async pushByUserData(
        userServers: Record<string, IUserServerRole>,
        type: int,
        forbid: boolean,
        endTime: int,
    ) {
        if (!userServers.length) {
            return
        }
        for (const sId in userServers) {
            const sv = userServers[sId]
            const uId = sv.uId
            await QueueAction.rpc(
                ActionGmUserForbid,
                {
                    uId: uId,
                    type: type,
                    forbid: !!forbid,
                    time: endTime,
                },
                uId,
                Int(sId),
            )
        }
    }

    public async checkUser(uIds: string[], accountType: int) {
        if (!uIds.length) {
            return false
        }
        uIds = array_unique(uIds)
        const totalFind = uIds.length
        let total = 0
        switch (accountType) {
            case Banned.TYPE_ROLE:
                for (const uId of uIds) {
                    const userRow = await ServerUserModel.findOneBy({ userId: String(uId) })
                    if (!userRow) {
                        return false
                    }
                }
                break
            case Banned.TYPE_USER:
                total = await CenterUserModel.countBy({ openId: In(uIds) })
                if (total < totalFind) {
                    return false
                }
                break
            case Banned.TYPE_DEVICE:
                total = await CenterUserModel.countBy({ deviceId: In(uIds) })
                if (total < totalFind) {
                    return false
                }
                break
        }
        return true
    }

    /**
     * checkExistUserForbid
     * 用户登录时，判断用户的设备、账号是否有封禁的记录
     * @param $account
     * @param $deviceId
     */
    public static async checkExistUserForbid(
        account: int | string,
        deviceId: string,
    ): Promise<[GameError | undefined, string[]]> {
        const accounts = [account]
        if (deviceId) {
            accounts.push(deviceId)
        }
        const rows = await UserForbidModel.findBy({ account: In(accounts), type: Banned.FORBID_ACCOUNT })
        let errorMsg
        const params: string[] = []
        if (rows.length == 0) {
            return [errorMsg, params]
        }
        const now = timestamp()
        for (const row of rows) {
            if (row.endTime == -1) {
                errorMsg = SystemErrors.ForbidLoginForbid
            } else if (row.endTime > now) {
                errorMsg = SystemErrors.ForbidLoginForbidTime
                params.push(UtilTime.format(row.endTime, 'YYYY-MM-DD HH:mm:ss'))
            }
        }
        return [errorMsg, params]
    }
}
