import { defineGameModule } from '../../startup/GameModule'
import { RoomNativeLobbyRoutes } from './lobby/RoomNativeLobbyRoutes'
import { RoomNativeLobbyStore } from './lobby/RoomNativeLobbyStore'
export const RoomModule = defineGameModule({
    name: 'room',
    nativeLobby: {
        routes: [
            {
                name: 'room-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new RoomNativeLobbyRoutes(services.identities, new RoomNativeLobbyStore()).register(registry),
            },
        ],
    },
})
