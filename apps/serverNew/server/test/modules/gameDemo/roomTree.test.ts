import assert from 'node:assert/strict'
import { GameDemoBossLobby } from '../../../src/modules/gameDemo/bean/GameDemoBossLobby'
import { GameDemoBossRoom } from '../../../src/modules/gameDemo/bean/GameDemoBossRoom'
import { GameDemoBossBattle } from '../../../src/modules/gameDemo/rules/GameDemoBossBattle'
import { GameDemoBossRoomTree } from '../../../src/modules/gameDemo/rules/GameDemoBossRoomTree'

describe('gameDemo Boss RoomTree adapter', () => {
    it('uses the existing Boss Beans for membership, full recovery and notification targets', async () => {
        const lobby = new GameDemoBossLobby(1)
        lobby.id = 1
        const boss = new GameDemoBossRoom(1)
        boss.id = 1
        GameDemoBossBattle.spawn(boss, 'tiger', 5_000_000)
        GameDemoBossBattle.enter(lobby, boss, 'tiger', 7)

        const originalLobbyRead = GameDemoBossLobby.loadOnlyRead
        const originalRoomRead = GameDemoBossRoom.loadOnlyRead
        GameDemoBossLobby.loadOnlyRead = (async () => lobby) as typeof GameDemoBossLobby.loadOnlyRead
        GameDemoBossRoom.loadOnlyRead = (async () => boss) as typeof GameDemoBossRoom.loadOnlyRead
        const room = new GameDemoBossRoomTree(1, 'tiger')
        const oldSession = { uid: 7, connectionId: 'old' }
        try {
            await assert.rejects(
                room.resume({ uid: 8, connectionId: 'outsider' }, async () => {}),
                /membership denied/,
            )
            const snapshots: unknown[] = []
            await room.resume(oldSession, async (snapshot) => {
                snapshots.push(snapshot)
            })
            assert.equal(snapshots.length, 1)
            assert.deepEqual(snapshots[0], GameDemoBossBattle.view(boss, 'tiger'))

            room.bind(boss)
            assert.deepEqual(boss.getNotifyUids(), [7])
            room.detach(oldSession)
            assert.deepEqual(boss.getNotifyUids(), [])
            assert.equal(GameDemoBossBattle.membership(lobby, 7).bossId, 'tiger')

            const freshSession = { uid: 7, connectionId: 'new' }
            await room.resume(freshSession, async (snapshot) => {
                snapshots.push(snapshot)
            })
            room.detach(oldSession)
            assert.equal(snapshots.length, 2)
            assert.deepEqual(boss.getNotifyUids(), [7])

            GameDemoBossBattle.leave(lobby, boss, 'tiger', 7, 1)
            room.tree.root.revoke(7)
            assert.deepEqual(boss.getNotifyUids(), [])
            await assert.rejects(
                room.resume(freshSession, async () => {}),
                /membership denied/,
            )
        } finally {
            await room.close()
            GameDemoBossLobby.loadOnlyRead = originalLobbyRead
            GameDemoBossRoom.loadOnlyRead = originalRoomRead
        }
    })
})
