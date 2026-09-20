import { QueuedLocalAction } from '../action/QueuedLocalAction'

export class DelayedActionQueueWorker {
    static readonly TIMEEVENT_LOOP_TIME = 1000
    private static timer?: ReturnType<typeof setInterval>

    static async init() {
        if (CP.platform.debugPoints?.queueAction) {
            Log.warn('CP.platform.debugPoints?.queueAction opened, delayed local actions will pause')
            return
        }
        await this.loopTimeEvent()
    }

    static async loopTimeEvent() {
        if (this.timer) return
        this.timer = setInterval(async () => {
            await QueuedLocalAction.recvTimeQueue()
        }, this.TIMEEVENT_LOOP_TIME)
    }

    static stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }
}
