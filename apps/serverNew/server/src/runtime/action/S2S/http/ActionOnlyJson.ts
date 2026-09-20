import json5 from 'json5'
import { ReqOnlyJson, ResOnlyJson } from '../../../protocol/S2S/http'
import { GameAction } from '../../GameAction'
import { InternalJsonActionRegistry } from './InternalJsonActionRegistry'

interface InternalJsonActionRequest {
    type?: string
    actionParams: any
    ip?: string
}

export class ActionOnlyJson extends GameAction {
    async doAction(req: ReqOnlyJson, res: ResOnlyJson) {
        // 示例代码，需要自己解析 JSON.parse(req.data)
        console.log('Action OnlyJson:', req)
        try {
            const actionData: InternalJsonActionRequest = json5.parse(req.json)
            const reqType = actionData.type ?? ''
            res.json = await InternalJsonActionRegistry.execute(
                reqType,
                actionData.actionParams ?? undefined,
                actionData.ip,
            )
        } catch (e) {
            res.json = '请求的字符串不为json:' + req.json
            Log.error(e)
        }
    }
}
