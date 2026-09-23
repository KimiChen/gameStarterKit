import { defineGameModule } from '../../startup/GameModule'
import { registerGameDemoRoutes, startGameDemoRooms, startGameDemoSeason } from './GameDemoRuntime'

export const GameDemoModule = defineGameModule({
    name: 'gameDemo',
    startup: [
        {
            name: 'gameDemo-boss-rooms',
            app: 'service',
            phase: 'runtime-ready',
            scope: 'process',
            run: startGameDemoRooms,
        },
        {
            name: 'gameDemo-season-scheduler',
            app: 'service',
            phase: 'runtime-ready',
            scope: 'server',
            run: startGameDemoSeason,
        },
    ],
    nativeLobby: {
        routes: [
            {
                name: 'gameDemo-lobby-routes',
                app: 'service',
                register: registerGameDemoRoutes,
            },
        ],
    },
})
