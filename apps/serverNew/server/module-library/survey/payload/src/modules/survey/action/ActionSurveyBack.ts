import { ReqSurveyBack } from '../SurveyS2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { ResDefault } from '../../../runtime/protocol/C2S/default'

export class ActionSurveyBack extends GameAction {
    async doAction(req: ReqSurveyBack, res: ResDefault) {
        return
    }
}
