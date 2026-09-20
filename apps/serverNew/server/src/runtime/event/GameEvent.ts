import { ActionEventSystem, EventArgs, EventHandler, EventSystem } from '@arthropoda/game-engine'
import {
    PropChangedEventArgs,
    PropChangeEventHandler,
    Ta_PropChangeEventHander,
    Calc_PropChangeEventHandler,
} from '../../modules/props/event/propEvent'
import {
    UserRegEventArgs,
    Ta_UserRegEventHandler,
    UserLoginEventArgs,
    Async_UserLoginEventHandler,
} from '../../modules/user/event/userEvent'
import { AppStartEventArgs, LogAppStartEventHandler } from '../../startup/AppStartEvent'
import { GameModuleCatalog } from '../../startup/GameModuleCatalog'

export class GameEvent {
    private static _event: EventSystem = new EventSystem()

    static async init() {
        this._event = new EventSystem()

        for (const entry of GameModuleCatalog.systems.events.entries) {
            if (entry.contribution.app === 'service' || entry.contribution.app === 'all') {
                ActionEventSystem.subscribe(entry.contribution.route, ...entry.contribution.handlers)
            }
        }

        this.subscribe(AppStartEventArgs, LogAppStartEventHandler)
        this.subscribe(UserRegEventArgs, Ta_UserRegEventHandler)
        this.subscribe(
            PropChangedEventArgs,
            Calc_PropChangeEventHandler,
            PropChangeEventHandler,
            Ta_PropChangeEventHander,
        )
        this.subscribe(UserLoginEventArgs, Async_UserLoginEventHandler)
    }

    static subscribe(args: typeof EventArgs, ...handlers: (typeof EventHandler<EventArgs>)[]) {
        this._event.subscribe(args, ...handlers)
    }

    static publish(args: EventArgs) {
        return this._event.publish(args)
    }

    static async triggerAsync() {
        return this._event.triggerAsync()
    }

    static async handlerCalculate() {
        return this._event.handlerCalculate()
    }
}
