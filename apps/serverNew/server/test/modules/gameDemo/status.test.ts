import { GameDemoBossRpc } from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoBoss'
import { GameDemoGuildRpc } from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoGuild'
import { GameDemoSeasonRpc } from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoSeason'
import assert from 'assert/strict'
import { GameDemoModule } from '../../../src/modules/gameDemo/GameDemoModule'
import { GameDemoHeroRpc } from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoHero'
import { GameDemoAlchemyRpc } from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoAlchemy'
import {
    GameDemoRpc,
    validateGameDemoStatusRes,
} from '../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemo'
import type {
    NativeLobbyRouteRegistry,
    NativeLobbyRouteServices,
} from '../../../src/runtime/lobby/NativeLobbyRouteRegistry'

describe('gameDemo P0 原生模块', () => {
    it('模块贡献登记真实状态查询，响应满足 shared 契约', async () => {
        const handlers = new Map<string, () => Promise<unknown>>()
        const registry = { register: (route: string, handler: () => Promise<unknown>) => handlers.set(route, handler) }
        for (const contribution of GameDemoModule.nativeLobby?.routes ?? []) {
            contribution.register(registry as unknown as NativeLobbyRouteRegistry, {} as NativeLobbyRouteServices)
        }
        assert.deepEqual(
            [...handlers.keys()].sort(),
            [
                ...Object.values(GameDemoRpc),
                ...Object.values(GameDemoHeroRpc),
                ...Object.values(GameDemoAlchemyRpc),
                ...Object.values(GameDemoSeasonRpc),
                ...Object.values(GameDemoGuildRpc),
                ...Object.values(GameDemoBossRpc),
            ].sort(),
        )
        const result = await handlers.get(GameDemoRpc.Status)!()
        assert.deepEqual(validateGameDemoStatusRes(result), { kit: 'gameDemo', runtime: 'serverNew', stage: 'P0' })
    })
})
