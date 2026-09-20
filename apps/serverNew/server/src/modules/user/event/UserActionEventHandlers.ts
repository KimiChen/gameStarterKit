import { ActionEventArgs, ActionEventHandlerBase } from '@arthropoda/game-engine'
import { taBase_roleLogin } from '../../../../generated/telemetry/base/roleLogin'

export class UserLoginActionLogHandler extends ActionEventHandlerBase {
    async handler(data: ActionEventArgs) {
        console.log(`exec LoginHandler event : ${data.ctx.apiName}`)
    }
}

export class UserEnterTelemetryHandler extends ActionEventHandlerBase {
    async handler() {
        await taBase_roleLogin(Ctx.user)
    }
}
