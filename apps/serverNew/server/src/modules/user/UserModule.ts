import { defineGameModule } from '../../startup/GameModule'
import { CenterController } from './http/CenterController'
import { UserSessionLifecycle } from './lifecycle/UserSessionLifecycle'
import { User } from './bean/User'
import { PowerScoreRules } from './rules/PowerScoreRules'
import { UserTelemetryProperties } from './telemetry/UserTelemetryProperties'
import { SsoController } from './http/SsoController'
import { UserEnterTelemetryHandler, UserLoginActionLogHandler } from './event/UserActionEventHandlers'
import { UserNativeLobbyRoutes } from './lobby/UserNativeLobbyRoutes'
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
    nativeLobby: {
        routes: [
            {
                name: 'user-native-lobby-routes',
                app: 'service',
                register: (registry, services) => {
                    const users = new NativeLobbyUserStore(services.registerCharacter)
                    services.onAuthenticated((uid, _internalUid, sId) => users.ensure(uid, sId))
                    // 会话结束的离线收尾。旧实现挂在 `SessionMgr` 的断线回调上，该链已随 P6 删除；
                    // 现在由原生 Lobby 在「当前连接被释放」时回调，语义等价且不会晚到覆盖新会话。
                    services.onReleased(async ({ internalUid }) => {
                        const user = await User.load(internalUid)
                        if (user) await UserSessionLifecycle.leave(user)
                    })
                    new UserNativeLobbyRoutes(services.identities, users).register(registry)
                },
            },
        ],
    },
})

function initializeUserConfig() {
    PowerScoreRules.init()
}
