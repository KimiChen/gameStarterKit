import { defineGameModule } from '../../startup/GameModule'
import { ShopNativeLobbyRoutes } from './lobby/ShopNativeLobbyRoutes'
import { ShopNativeLobbyStore } from './lobby/ShopNativeLobbyStore'
export const ShopModule = defineGameModule({
    name: 'shop',
    nativeLobby: {
        routes: [
            {
                name: 'shop-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new ShopNativeLobbyRoutes(services.identities, new ShopNativeLobbyStore()).register(registry),
            },
        ],
    },
})
