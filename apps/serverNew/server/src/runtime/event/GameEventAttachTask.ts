import { IActionAttachTask } from '@arthropoda/game-engine'
import { GameEvent } from './GameEvent'

export class GameEventAttachTask implements IActionAttachTask {
    async onDoAction() {
        await GameEvent.handlerCalculate()
    }

    async onEngineEnd(): Promise<void> {
        await GameEvent.triggerAsync()
    }

    async onStart(): Promise<void> {
        return
    }
}
