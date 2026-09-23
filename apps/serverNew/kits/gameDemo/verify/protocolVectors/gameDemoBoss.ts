import { GameDemoBossRpc } from '../../../../../shared/src/native/lobbyRpc/domains/gameDemoBoss';
import { GAME_DEMO_CONFIG } from '@game/shared/kits/gameDemo/config';
import type { LobbyRpcVectorFile } from './types';
const rooms = GAME_DEMO_CONFIG.bosses.map(boss => ({ bossId: boss.id, name: boss.name, runId: `1:${boss.id}:1`, runNumber: 1, hp: boss.maxHp, maxHp: boss.maxHp, phase: 'running' as const, revision: 1, ownerEpoch: 1, respawnAt: 0, damage: [] }));
const state = { room: rooms[0], currentBossId: 'tiger' as const, generation: 1, serverNow: 1, nextAttackAt: 0, heroAttack: 10, heroRevision: 0, myDamage: 0, appliedDamage: 0 };
const list = { rooms, currentBossId: null, generation: 0 };
export default {
    [GameDemoBossRpc.List]: { request: {}, response: list },
    [GameDemoBossRpc.Get]: { request: { bossId: 'tiger' }, response: state },
    [GameDemoBossRpc.Enter]: { request: { clientReqId: 'enter', bossId: 'tiger' }, response: state },
    [GameDemoBossRpc.Leave]: { request: { clientReqId: 'leave', bossId: 'tiger', generation: 1 }, response: list },
    [GameDemoBossRpc.Attack]: { request: { clientReqId: 'attack', bossId: 'tiger', runId: '1:tiger:1', generation: 1 }, response: state },
} satisfies LobbyRpcVectorFile;
