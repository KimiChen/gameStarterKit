import { ModSync, LoadedHashMod } from '@arthropoda/game-engine'
import { UserLoginInitializer } from '../../../../modules/user/action/UserLoginInitializer'
import { ReqLogin, ResLogin } from '../../../protocol/C2S/base'
import { GameAction } from '../../GameAction'
import { Mod } from '../../../../../generated/protocol/server/C2S/mod/Mod'

/**
 *  请求登录
 */
export class ActionLogin extends GameAction {
    async getBindId() {
        return undefined
    }

    async doAction(req: ReqLogin, res: ResLogin) {
        // log.info('执行注册回调函数......', req)

        // 生成uID
        const uId = req.id
        const user = await UserLoginInitializer.loadOrCreate(uId, req.name, SERVER_ID)

        // 绑定
        await Ctx.bind(user.id, user.sId)

        const loadModMap: Map<string, LoadedHashMod> = new Map([['user', { bean: user }]])
        const modData = await ModSync.autoSetMod(loadModMap)

        res.id = uId
        res.isLogin = true
        res.name = user.name
        res.mod = modData as Mod
    }
}
