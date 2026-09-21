import { defineGameModule } from '../../startup/GameModule'
import { IncomeNativeLobbyRoutes } from './lobby/IncomeNativeLobbyRoutes'
import { IncomeNativeLobbyStore } from './lobby/IncomeNativeLobbyStore'

/**
 * income 模块：铜币收益的 wire 面 + 会话钩子。
 *
 * 规则、账本与账户都归本模块；认证成功时原子初始化新账户，并把已有账户的离线收益暂存。
 */
export const IncomeModule = defineGameModule({
    name: 'income',
    nativeLobby: {
        routes: [
            {
                name: 'income-native-lobby-routes',
                app: 'service',
                register: (registry, services) => {
                    const store = new IncomeNativeLobbyStore()
                    // 登录侧：首次原子初始化账户；已有账户只在这里算好离线暂存，领取前不入账。
                    services.onAuthenticated((uid, internalUid, sId) => store.parkOffline(internalUid, uid, sId))
                    new IncomeNativeLobbyRoutes(services.identities, store).register(registry)
                },
            },
        ],
    },
})
