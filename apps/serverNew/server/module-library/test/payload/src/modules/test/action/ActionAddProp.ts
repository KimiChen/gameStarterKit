import { ApiCall, getServerIdByUid } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ActionUserFieldValUpdate } from '../../user/action/ActionUserFieldValUpdate'
import { ReqAddProp, ResAddProp } from '../TestC2S'

export class ActionAddProp extends GameAction {
    async doAction(req: ReqAddProp, res: ResAddProp) {
        Log.debug('业务测试串行开始')
        if (req.propId !== 101 || req.propNum <= 0) {
            throw SystemErrors.ProtectRequest.params({
                vars: ['作为测试报错req.propId !== 101 || req.propNum <= 0'],
            })
        }

        this.user.gc += req.propNum
        res.propId = req.propId
        res.propNum = this.user.gc
        res.result = true
        Log.debug('业务测试串行结束')

        const targetId = this.user.id
        LocalAction.send(
            ActionUserFieldValUpdate,
            {
                uId: targetId,
                data: [
                    {
                        field: 'exp',
                        val: '100',
                    },
                ],
            },
            targetId,
            getServerIdByUid(targetId),
        )
    }

    static num = 1

    async getBindId(call: ApiCall): Promise<int | undefined> {
        //测试业务串行
        return (ActionAddProp.num++ % 2) + 1
    }
}
