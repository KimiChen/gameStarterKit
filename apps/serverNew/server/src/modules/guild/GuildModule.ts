import { defineGameModule } from '../../startup/GameModule'
import { GuildNativeLobbyRoutes } from './lobby/GuildNativeLobbyRoutes'
import { GuildNativeLobbyStore } from './lobby/GuildNativeLobbyStore'

export const GuildModule = defineGameModule({
    name: 'guild',
    errorCodes: { namePrefixes: ['Guild'] },
    nativeLobby: {
        routes: [
            {
                name: 'guild-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new GuildNativeLobbyRoutes(
                        services.identities,
                        new GuildNativeLobbyStore({
                            registerCharacter: services.registerCharacter,
                            pushToUser: services.pushToUser,
                        }),
                    ).register(registry),
            },
        ],
    },
})
