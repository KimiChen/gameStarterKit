import { ActionUserRename } from '../../action/ActionUserRename'
import { User } from '../../bean/User'
import { ServerUserModel } from '../../../../../generated/persistence/ServerUserModel'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { Player } from './Player'

export class ActionPlayerDoReName extends Player {
    public async doAction(params: { [key: string]: any }) {
        const userId = params.role_id ?? ''
        const name = params.new_name ?? ''
        if (!userId || !name || !Int(userId)) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }

        const user = await User.load(userId)
        if (!user) {
            this.gmContext.setGmMsg(1001, '用户不存在', params)
            return false
        }

        if (name == user.name) {
            this.gmContext.setGmMsg(1001, '名字不能与之前名字相同', params)
            return false
        }
        const exist = await ServerUserModel.existsBy({ userName: name, userSid: user.sId })
        if (exist) {
            this.gmContext.setGmMsg(1001, '名字已存在', params)
            return false
        }
        await QueuedLocalAction.rpc(ActionUserRename, { uId: userId, name: name }, userId, user.sId)
        return { new_name: name }
    }
}
