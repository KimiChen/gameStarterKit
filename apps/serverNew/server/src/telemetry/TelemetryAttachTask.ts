import { IActionAttachTask } from '@arthropoda/game-engine'
import { TelemetryEventWriter } from './TelemetryEventWriter'

export class TelemetryAttachTask implements IActionAttachTask {
    async onStart(): Promise<void> {
        Ctx._ta = new TelemetryEventWriter()
    }

    async onDoAction(res: any): Promise<void> {
        return
    }

    async onEngineEnd(): Promise<void> {
        Ctx.ta.flushLog()
        Ctx.ta.clear()
    }
}
