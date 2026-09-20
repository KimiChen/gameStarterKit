import { defineGameModule } from '../../startup/GameModule'
import { SnakeCosmeticNativeLobbyRoutes } from './lobby/SnakeCosmeticNativeLobbyRoutes'
import { SnakeCosmeticNativeLobbyStore } from './lobby/SnakeCosmeticNativeLobbyStore'

export const SnakeCosmeticModule = defineGameModule({
    name: 'snakeCosmetic',
    nativeLobby: {
        routes: [
            {
                name: 'snakeCosmetic-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new SnakeCosmeticNativeLobbyRoutes(
                        services.identities,
                        new SnakeCosmeticNativeLobbyStore(),
                    ).register(registry),
            },
        ],
    },
})
