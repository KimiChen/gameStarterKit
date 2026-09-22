import { defineGameModule } from '../../startup/GameModule'
import { CenterController } from './http/CenterController'
import { UserSessionLifecycle } from './lifecycle/UserSessionLifecycle'
import { User } from './bean/User'
import { PowerScoreRules } from './rules/PowerScoreRules'
import { UserTelemetryProperties } from './telemetry/UserTelemetryProperties'
import { SsoController } from './http/SsoController'
import { UserEnterTelemetryHandler, UserLoginActionLogHandler } from './event/UserActionEventHandlers'
import { NativeLobbyUserEnter } from './lobby/NativeLobbyUserEnter'
import { NativeLobbyUserStore } from './lobby/NativeLobbyUserStore'

export const UserModule = defineGameModule({
    name: 'user',
    configuration: {
        initializers: [{ name: 'initialize-user-config', app: 'all', after: ['attr'], handler: initializeUserConfig }],
    },
    events: {
        actionHandlers: [
            {
                name: 'user-enter-telemetry',
                app: 'service',
                after: ['rank-user-enter'],
                route: 'user/Enter',
                handlers: [UserEnterTelemetryHandler],
            },
            {
                name: 'user-login-action-log',
                app: 'service',
                route: 'base/Login',
                handlers: [UserLoginActionLogHandler],
            },
        ],
    },
    telemetry: {
        providers: [{ name: 'user-telemetry-properties', app: 'service', provider: new UserTelemetryProperties() }],
    },
    managementHttp: {
        controllers: [
            {
                kind: 'controller',
                name: 'center-controller',
                app: 'management',
                after: ['adjust'],
                controller: CenterController,
            },
            {
                kind: 'controller',
                name: 'sso-controller',
                app: 'management',
                after: ['center-controller'],
                controller: SsoController,
            },
        ],
    },
    errorCodes: { namePrefixes: ['User', 'Sign', 'Magic'] },
    nativeLobbyAuth: {
        handlers: [
            {
                name: 'user-native-lobby-auth',
                app: 'service',
                onAuthenticated: async (uid, internalUid, sId, services) => {
                    // 建档必须排在最前：`User` 档是所有 Bean 类业务的前提，且 `income-native-lobby-auth`
                    // 已声明 `after: ['user-native-lobby-auth']`，本 handler 是它唯一的上游。
                    await NativeLobbyUserEnter.enter(internalUid, sId)
                    await new NativeLobbyUserStore(services.registerCharacter).ensure(uid, sId)
                },
                onReleased: async ({ internalUid }) => {
                    const user = await User.load(internalUid)
                    if (user) await UserSessionLifecycle.leave(user)
                },
            },
        ],
    },
})

function initializeUserConfig() {
    PowerScoreRules.init()
}
