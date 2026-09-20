import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqLoveTest } from '../LoveC2S'
import { ActionLove } from './ActionLove'

export class ActionLoveTest extends ActionLove {
    async doAction(req: ReqLoveTest, res: ResDefault) {
        return
    }
}
