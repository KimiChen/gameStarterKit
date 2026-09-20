import { IActionAttachTask } from '@arthropoda/game-engine'
import { ActionMail } from './ActionMail'

export class MailAttachTask implements IActionAttachTask {
    async onDoAction(res: any): Promise<void> {
        await ActionMail.endAction()
    }

    async onEngineEnd(): Promise<void> {
        return
    }

    async onStart(): Promise<void> {
        return
    }
}
