import { User } from '../../bean/User'
import { Player } from './Player'

export class ActionPlayerGetPlayerOtherInfo extends Player {
    public offset: int = 0

    public limit: int = 0

    /**
     * 玩家其他信息详情
     * @param params
     * @return array|false
     */
    public async doAction(params: { [key: string]: any }) {
        ;[this.offset, this.limit] = this.getPageParams(params)
        /*
         * 灵脉信息(nexus)、
         * */
        params.type = params.type ?? ''
        params.name = params.name ?? ''
        const userId = params.role_id ?? ''
        if (!params.type || !userId || !Int(userId)) {
            this.gmContext.setGmMsg(3001, '参数错误！')
            return false
        }

        const userInfo = await User.loadOnlyRead(userId)
        const functionName = params.type
        if (!(functionName in this)) {
            this.gmContext.setGmMsg(3001, '参数错误')
            return false
        }
        const [data, count, field] = (this as any)[functionName](userId, userInfo, params)

        return { list: data, count: count, field: field }
    }

    /*******************************内部需要调用的一些方法***************************************/
}
