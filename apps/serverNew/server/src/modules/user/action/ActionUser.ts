import { IActionLogic } from '@arthropoda/game-engine'
import { ApiCall } from '@arthropoda/game-engine'
import { User } from '../bean/User'
import { UserDayInit } from './UserDayInit'

/**
 * 该类作为每日重置, action鉴权 的入口需要尽量被继承
 */
export class ActionUser implements IActionLogic {
    async getTaskGroupId(resCall: ApiCall): Promise<number | undefined> {
        return undefined
    }

    protected _user: any = undefined

    get user() {
        return this._user as User
    }

    async actionBefore(call: ApiCall<any, any, any>): Promise<void> {
        if (call.uId <= 0) {
            return
        }
        const user = await User.load(call.uId)
        if (user == undefined) {
            return
        }
        await UserDayInit.dayInit(user)
        this._user = user
        // sid的初始化改到上下文里直接获取了
    }

    doAction(req: any, res: any): Promise<void> {
        throw new Error('Method not implemented.')
    }

    async getBindId(call: ApiCall): Promise<int | undefined> {
        return call.uId
    }
}
