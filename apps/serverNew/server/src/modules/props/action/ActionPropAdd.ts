import { Props } from '../inventory/Props'
import { ReqPropAdd, ResPropAdd } from '../PropsC2S'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { GameAction } from '../../../runtime/action/GameAction'

export class ActionPropAdd extends GameAction {
    async doAction(req: ReqPropAdd, res: ResPropAdd) {
        const user = this.user

        const props: PropItem[] = [{ propId: req.id, num: req.num }]

        const awardResp: AwardResponse = {
            awards: [],
        }

        await Props.addProps(user, props, awardResp)

        res.awards = awardResp
    }
}
