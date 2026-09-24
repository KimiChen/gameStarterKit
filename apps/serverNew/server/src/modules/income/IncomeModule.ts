import { defineGameModule } from '../../startup/GameModule'
import { IncomeNativeLobbyAuth } from './lobby/IncomeNativeLobbyAuth'

/**
 * income 模块：铜币收益的规则与登录侧离线暂存入口。
 *
 * 路由面（`income.getPending` / `income.settleOnline` / `income.claimOffline`）全部由
 * `apps/shared/schema/protocols/C2S/income.json` 声明并生成 Action，本模块**不**贡献任何
 * 原生 Lobby 路由；这里只登记「认证成功后把离线暂存派发成一次 Action」这一条会话钩子。
 */
export const IncomeModule = defineGameModule({
    name: 'income',
    configuration: {
        initializers: [
            {
                name: 'register-income-session-actions',
                app: 'service',
                handler: () => IncomeNativeLobbyAuth.registerActions(),
            },
        ],
    },
    nativeLobbyAuth: {
        handlers: [
            {
                name: 'income-native-lobby-auth',
                app: 'service',
                after: ['user-native-lobby-auth'],
                onAuthenticated: async (_uid, internalUid, sId) => {
                    await IncomeNativeLobbyAuth.onAuthenticated(internalUid, sId)
                },
            },
        ],
    },
})
