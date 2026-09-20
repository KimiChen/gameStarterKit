import { defineGameModule } from '../../startup/GameModule'
import { SlgNativeLobbyRoutes } from './lobby/SlgNativeLobbyRoutes'
import { SlgNativeLobbyStore } from './lobby/SlgNativeLobbyStore'

export const SlgModule = defineGameModule({
    name: 'slg',
    nativeLobby: {
        routes: [
            {
                name: 'slg-native-lobby-routes',
                app: 'service',
                after: ['shop-native-lobby-routes'],
                register: (registry, services) =>
                    new SlgNativeLobbyRoutes(services.identities, new SlgNativeLobbyStore()).register(registry),
            },
        ],
    },
})
