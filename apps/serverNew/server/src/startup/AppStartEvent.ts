import { Event, EventArgs, EventHandler } from '@arthropoda/game-engine'

@Event()
export class AppStartEventArgs extends EventArgs {
    startTime: int = 0
}

export class LogAppStartEventHandler extends EventHandler<AppStartEventArgs> {
    async handler(data: AppStartEventArgs) {
        Log.debug('appStart:' + data.startTime)
    }
}
