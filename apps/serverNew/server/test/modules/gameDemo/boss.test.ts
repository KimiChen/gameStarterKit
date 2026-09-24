import assert from 'node:assert/strict'
import { GAME_DEMO_CONFIG } from '../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import { GameDemoBossLobby } from '../../../src/modules/gameDemo/bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../../../src/modules/gameDemo/bean/GameDemoBossRoom'
import { GameDemoBossBattle } from '../../../src/modules/gameDemo/rules/GameDemoBossBattle'

const NOW = 5_000_000
const code = (expected: string) => (error: { code?: string }) => error.code === expected

function arena() {
    const lobby = new GameDemoBossLobby(1)
    lobby.id = 1
    const tiger = new GameDemoBossRoom(1)
    tiger.id = 1
    GameDemoBossBattle.spawn(tiger, 'tiger', NOW)
    const dragon = new GameDemoBossRoom(2)
    dragon.id = 2
    GameDemoBossBattle.spawn(dragon, 'dragon', NOW)
    return { lobby, tiger, dragon }
}

describe('gameDemo boss battle', () => {
    it('keeps one room per account and rejects requests from a switched room', () => {
        const { lobby, tiger, dragon } = arena()
        GameDemoBossBattle.enter(lobby, tiger, 'tiger', 7)
        assert.deepEqual(GameDemoBossBattle.membership(lobby, 7), { bossId: 'tiger', generation: 1 })
        GameDemoBossBattle.enter(lobby, dragon, 'dragon', 7)
        assert.deepEqual(GameDemoBossBattle.membership(lobby, 7), { bossId: 'dragon', generation: 2 })
        assert.throws(
            () => GameDemoBossBattle.attack(lobby, tiger, 'tiger', 7, { runNumber: 1, generation: 1 }, 10, NOW),
            code('GAME_DEMO_BOSS_STALE'),
        )
        assert.throws(
            () => GameDemoBossBattle.attack(lobby, dragon, 'dragon', 7, { runNumber: 2, generation: 2 }, 10, NOW),
            code('GAME_DEMO_BOSS_STALE'),
        )
    })

    it('strikes once per cooldown and settles every damaging participant by rank', () => {
        const { lobby, tiger } = arena()
        GameDemoBossBattle.enter(lobby, tiger, 'tiger', 1)
        GameDemoBossBattle.enter(lobby, tiger, 'tiger', 2)
        const hit = (uid: number, attack: number, at: number) =>
            GameDemoBossBattle.attack(lobby, tiger, 'tiger', uid, { runNumber: 1, generation: 1 }, attack, at)
        assert.equal(hit(1, 500, NOW), 500)
        assert.throws(() => hit(1, 500, NOW + 999), code('GAME_DEMO_BOSS_COOLDOWN'))
        assert.equal(hit(2, 900, NOW + 1), 900)
        assert.equal(hit(1, 5000, NOW + 1000), 600, '最后一击不超过剩余血量')
        assert.equal(tiger.phase, 'settled')
        assert.equal(tiger.respawnAt, NOW + 1000 + GAME_DEMO_CONFIG.bossRespawnMs)
        assert.deepEqual(
            tiger.rewards!.values().map((reward) => [reward.uid, reward.gold]),
            [
                [1, 100],
                [2, 50],
            ],
        )
        assert.throws(() => hit(2, 1, NOW + 2000), code('GAME_DEMO_BOSS_ENDED'))
    })

    it('auto-attacks on tick, counters every three seconds and revives after death', async () => {
        const { lobby, tiger } = arena()
        GameDemoBossBattle.enter(lobby, tiger, 'tiger', 1)
        GameDemoBossBattle.attack(lobby, tiger, 'tiger', 1, { runNumber: 1, generation: 1, autoAttack: true }, 0, NOW)
        const attack = async () => 10
        await GameDemoBossBattle.step(lobby, tiger, 'tiger', NOW, attack)
        assert.equal(tiger.hp, 1990)
        assert.equal(tiger.nextCounterAt, NOW + GAME_DEMO_CONFIG.bossCounterMs)
        for (let second = 1; second <= 9; second++)
            await GameDemoBossBattle.step(lobby, tiger, 'tiger', NOW + second * 1000, attack)
        const fighter = tiger.fighters!.get(1)!
        assert.equal(fighter.hp, 0, '三次反击 55×3 ≥ 150')
        const diedAt = fighter.reviveAt - GAME_DEMO_CONFIG.bossReviveMs
        await GameDemoBossBattle.step(lobby, tiger, 'tiger', fighter.reviveAt, attack)
        assert.equal(tiger.fighters!.get(1)!.hp, GAME_DEMO_CONFIG.bossPlayerHp)
        assert.ok(diedAt > NOW)
        assert.deepEqual(
            GameDemoBossBattle.view(tiger, 'tiger')
                .events.map((event) => event.kind)
                .slice(-2),
            ['counter', 'revive'],
        )
    })

    it('deactivates fighters who left and carries only active ones into the next run', async () => {
        const { lobby, tiger } = arena()
        GameDemoBossBattle.enter(lobby, tiger, 'tiger', 1)
        GameDemoBossBattle.enter(lobby, tiger, 'tiger', 2)
        GameDemoBossBattle.leave(lobby, tiger, 'tiger', 2, 1)
        assert.deepEqual(GameDemoBossBattle.watchers(tiger), [1])
        tiger.hp = 1
        GameDemoBossBattle.attack(lobby, tiger, 'tiger', 1, { runNumber: 1, generation: 1 }, 10, NOW)
        await GameDemoBossBattle.step(lobby, tiger, 'tiger', tiger.respawnAt, async () => 10)
        assert.equal(tiger.runNumber, 2)
        assert.equal(tiger.hp, 2000)
        assert.deepEqual(tiger.fighters!.keys(), [1])
        assert.equal(tiger.rewards!.size(), 0)
    })
})
