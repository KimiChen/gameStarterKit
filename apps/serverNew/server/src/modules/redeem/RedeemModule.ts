import { defineGameModule } from '../../startup/GameModule'
import { RedeemNativeLobbyRoutes } from './lobby/RedeemNativeLobbyRoutes'
import { RedeemNativeLobbyStore } from './lobby/RedeemNativeLobbyStore'
export const RedeemModule = defineGameModule({
    name: 'redeem',
    nativeLobby: {
        routes: [
            {
                name: 'redeem-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new RedeemNativeLobbyRoutes(services.identities, new RedeemNativeLobbyStore()).register(registry),
            },
        ],
    },
})
