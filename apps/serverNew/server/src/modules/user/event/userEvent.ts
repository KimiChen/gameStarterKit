import { EventArgs, EventHandler, Event } from '@arthropoda/game-engine'
import { taBase_userCreate } from '../../../../generated/telemetry/base/userCreate'

@Event()
export class UserRegEventArgs extends EventArgs {
    uId: int = 0
}

export class Ta_UserRegEventHandler extends EventHandler<UserRegEventArgs> {
    async handler(data: UserRegEventArgs) {
        Log.debug('Ta_UserRegEventHandler:' + data.uId)
        taBase_userCreate(Ctx.user)
    }
}

@Event()
export class UserLoginEventArgs extends EventArgs {
    uId: int = 0

    time: int = 0
}

export class Async_UserLoginEventHandler extends EventHandler<UserLoginEventArgs> {
    isSync: boolean = false

    async handler(data: UserLoginEventArgs) {
        Log.debug('Async_UserLoginEventHandler:' + data.uId)
    }
}
