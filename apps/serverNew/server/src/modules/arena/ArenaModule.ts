import { defineGameModule } from '../../startup/GameModule'
import { ArenaNativeLobbyRoutes } from './lobby/ArenaNativeLobbyRoutes'
import { ArenaNativeLobbyStore } from './lobby/ArenaNativeLobbyStore'

export const ArenaModule = defineGameModule({
    name: 'arena',
    nativeLobby: {
        routes: [
            {
                name: 'arena-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new ArenaNativeLobbyRoutes(services.identities, new ArenaNativeLobbyStore()).register(registry),
            },
        ],
    },
})
