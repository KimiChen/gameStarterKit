import { defineGameModule } from '../../startup/GameModule'
import { ArenaShopNativeLobbyRoutes } from './lobby/ArenaShopNativeLobbyRoutes'
import { ArenaShopNativeLobbyStore } from './lobby/ArenaShopNativeLobbyStore'

export const ArenaShopModule = defineGameModule({
    name: 'arenaShop',
    nativeLobby: {
        routes: [
            {
                name: 'arena-shop-native-lobby-routes',
                app: 'service',
                after: ['arena-native-lobby-routes', 'shop-native-lobby-routes'],
                register: (registry, services) =>
                    new ArenaShopNativeLobbyRoutes(services.identities, new ArenaShopNativeLobbyStore()).register(
                        registry,
                    ),
            },
        ],
    },
})
