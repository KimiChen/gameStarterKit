import { ApiCall } from '../net/client/base/ApiCall'
import { IActionLogic } from './IActionLogic'

export class ActionComm implements IActionLogic {
    async actionBefore(call: ApiCall<any, any, any>): Promise<void> {
        return
    }
    async doAction(req: any, res: any): Promise<void> {
        throw new Error('Method not implemented.')
    }
    async getBindId(call: ApiCall): Promise<number | undefined> {
        return undefined
    }
}