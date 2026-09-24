import type {
    IGameDemoEmptyReq,
    IGameDemoMailbox,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import { GameDemoMailbox } from '../rules/GameDemoMailbox'
import { ActionGameDemo } from './ActionGameDemo'

export class ActionGameDemoMailList extends ActionGameDemo {
    async doAction(_req: IGameDemoEmptyReq, res: IGameDemoMailbox): Promise<void> {
        res.mails = GameDemoMailbox.view(await this.loadPlayer()).mails
    }
}
