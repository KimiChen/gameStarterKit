import { UserOnlineMgr } from '@arthropoda/game-engine'
import { Like } from '@arthropoda/typeorm'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { UserBaseRef } from '../../user/ref/UserBaseRef'
import { FriendInfo, ReqFriendSearch, ResFriendSearch } from '../FriendC2S'
import { ActionFriend } from './ActionFriend'

/**
 * 查找玩家
 */
export class ActionFriendSearch extends ActionFriend {
    async doAction(req: ReqFriendSearch, res: ResFriendSearch) {
        const user = this.user
        const name = req.name.trim()
        if (name.length < 1) {
            throw SystemErrors.SysParamError
        }

        const uIds: int[] = []
        // 先判断是否为用户id
        if (isNumeric(name) && name.length == user.id.toString().length) {
            const searchId = parseInt(name)
            uIds.push(searchId)
        }

        if (uIds.length == 0) {
            const searchUsers = await getUserByNameForFuzzy(name)
            for (const searchUser of searchUsers) {
                if (searchUser.userId != user.id.toString()) {
                    uIds.push(parseInt(searchUser.userId))
                }
            }
        }

        if (uIds.length == 0) {
            return
        }

        const cache = await ActionFriend.load(user.id)

        const friends: FriendInfo[] = []
        const users = await UserBaseRef.loadAll(uIds)
        for (const fId of uIds) {
            const friendUser = users.get(fId)
            if (!friendUser) {
                continue
            }
            friends.push({
                uInfo: UserProfileFormatter.format(friendUser).toModData() as any,
                online: await UserOnlineMgr.isOnline(friendUser.id, friendUser.sId),
                time: 0,
                status: await ActionFriend.getStatus(cache!, fId),
            })
        }

        res.info = friends
    }
}

export async function getUserByNameForFuzzy(name: string) {
    return ServerUserModel.find({
        where: {
            userName: Like(`%${name}%`),
        },
    })
}

function isNumeric(name: string): boolean {
    return !isNaN(Number(name))
}
