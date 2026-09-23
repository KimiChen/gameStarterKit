import { gameDemoLifecycle } from './GameDemoPersistence'
import { CronService } from '@arthropoda/game-engine'
import { GameDemoRpc } from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemo'
import type { NativeLobbyRouteRegistry, NativeLobbyRouteServices } from '../../runtime/lobby/NativeLobbyRouteRegistry'
import { GameDemoBossRoutes } from './boss/GameDemoBossRoutes'
import { gameDemoBossRooms, installGameDemoBossRooms } from './boss/GameDemoBossRooms'
import { GameDemoSeason } from './season/GameDemoSeason'
import { gameDemoStatus } from './api/growth'
import { GameDemoRoutes } from './GameDemoRoutes'

export async function startGameDemoRooms(): Promise<void> {
    await gameDemoLifecycle.initialize()
    await gameDemoLifecycle.startRuntime()
    gameDemoBossRooms().start(SERVER_ID)
}
export async function startGameDemoSeason(): Promise<void> {
    // SID is part of the scheduler identity: different realms must never suppress each other.
    await CronService.initTask(`gameDemo:season:${SERVER_ID}`, '* * * * * *', async () => {
        if (await gameDemoLifecycle.runnable()) await new GameDemoSeason().tick(SERVER_ID)
    })
}
export function registerGameDemoRoutes(registry: NativeLobbyRouteRegistry, services: NativeLobbyRouteServices): void {
    registry.register(GameDemoRpc.Status, async () => gameDemoStatus())
    new GameDemoRoutes(services.identities).register(registry)
    new GameDemoBossRoutes(services, installGameDemoBossRooms(services.pushToUser)).register(registry)
}
