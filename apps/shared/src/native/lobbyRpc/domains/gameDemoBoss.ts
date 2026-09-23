import { GAME_DEMO_CONFIG } from '../../../kits/gameDemo/config';
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from '../../../protocol/http';
import { defineLobbyRpcDomain, defineRpcQuery, defineRpcIdempotentWrite, defineLobbyPush } from '../../../protocol/lobbyRpc/defineDomain';
import { emptyPayload, requiredId, rpcRecord } from '../../../protocol/lobbyRpc/primitives';
import type { GameDemoBossId, GameDemoBossRoom, GameDemoBossState, GameDemoBossList, GameDemoBossChanged, GameDemoBossBattle } from '../../../kits/gameDemo/api/boss/index';
export const GameDemoBossRpc = { List: 'gameDemoBoss.list', Get: 'gameDemoBoss.get', Enter: 'gameDemoBoss.enter', Leave: 'gameDemoBoss.leave', Attack: 'gameDemoBoss.attack' } as const;
export const GameDemoBossPush = { Changed: 'gameDemoBoss.changed' } as const;
export interface IGameDemoBossListReq { readonly [key: string]: never; }
export interface IGameDemoBossGetReq { bossId: GameDemoBossId; }
export interface IGameDemoBossEnterReq { clientReqId: string; bossId: GameDemoBossId; }
export interface IGameDemoBossLeaveReq { clientReqId: string; bossId: GameDemoBossId; generation: number; }
export interface IGameDemoBossAttackReq { clientReqId: string; bossId: GameDemoBossId; runId: string; generation: number; autoAttack?: boolean; }
export type IGameDemoBossListRes = GameDemoBossList;
export type IGameDemoBossRes = GameDemoBossState;
export function validateGameDemoBossId(input: unknown): GameDemoBossId {
    if (input !== 'tiger' && input !== 'dragon' && input !== 'phoenix') throw new WireValidationError('GAME_DEMO_BOSS_ID', 'bossId');
    return input;
}
export const validateGameDemoBossListReq: RuntimeValidator<IGameDemoBossListReq> = input => emptyPayload(input);
export const validateGameDemoBossGetReq: RuntimeValidator<IGameDemoBossGetReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['bossId'], [], 'payload'); return { bossId: validateGameDemoBossId(v.bossId) };
};
export const validateGameDemoBossEnterReq: RuntimeValidator<IGameDemoBossEnterReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'bossId'], [], 'payload');
    return { clientReqId: requiredId(v, 'clientReqId'), bossId: validateGameDemoBossId(v.bossId) };
};
export const validateGameDemoBossLeaveReq: RuntimeValidator<IGameDemoBossLeaveReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'bossId', 'generation'], [], 'payload');
    return { clientReqId: requiredId(v, 'clientReqId'), bossId: validateGameDemoBossId(v.bossId), generation: finiteInteger(v.generation, 'payload.generation', 1) };
};
export const validateGameDemoBossAttackReq: RuntimeValidator<IGameDemoBossAttackReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'bossId', 'runId', 'generation'], ['autoAttack'], 'payload');
    if (v.autoAttack !== undefined && typeof v.autoAttack !== 'boolean') throw new WireValidationError('GAME_DEMO_BOSS_AUTO', 'payload.autoAttack');
    return { ...(v.autoAttack === undefined ? {} : { autoAttack: v.autoAttack as boolean }), clientReqId: requiredId(v, 'clientReqId'), bossId: validateGameDemoBossId(v.bossId), generation: finiteInteger(v.generation, 'payload.generation', 1), runId: boundedString(v.runId, 'payload.runId', 1, 64) };
};
export function validateGameDemoBossBattle(input: unknown): GameDemoBossBattle {
    const v = rpcRecord(input, 'battle');
    assertExactKeys(v, ['players', 'events', 'sequence', 'nextCounterAt'], [], 'battle');
    const sequence = finiteInteger(v.sequence, 'battle.sequence', 0);
    if (!Array.isArray(v.players) || v.players.length > GAME_DEMO_CONFIG.bossMaxParticipants || !Array.isArray(v.events) || v.events.length > GAME_DEMO_CONFIG.bossEventLimit) throw new WireValidationError('GAME_DEMO_BOSS_BATTLE', 'battle');
    const players = v.players.map(input => {
        const p = rpcRecord(input, 'fighter');
        assertExactKeys(p, ['uid', 'generation', 'active', 'hp', 'maxHp', 'autoAttack', 'nextAttackAt', 'reviveAt'], [], 'fighter');
        if (typeof p.active !== 'boolean' || typeof p.autoAttack !== 'boolean') throw new WireValidationError('GAME_DEMO_BOSS_FIGHTER', 'fighter');
        const maxHp = finiteInteger(p.maxHp, 'fighter.maxHp', 1);
        const hp = finiteInteger(p.hp, 'fighter.hp', 0, maxHp);
        const reviveAt = finiteInteger(p.reviveAt, 'fighter.reviveAt', 0);
        if ((hp === 0) !== (reviveAt > 0)) throw new WireValidationError('GAME_DEMO_BOSS_REVIVE', 'fighter');
        return { uid: boundedString(p.uid, 'fighter.uid', 1, 128), generation: finiteInteger(p.generation, 'fighter.generation', 1), active: p.active, hp, maxHp, autoAttack: p.autoAttack, nextAttackAt: finiteInteger(p.nextAttackAt, 'fighter.nextAttackAt', 0), reviveAt };
    });
    if (new Set(players.map(p => p.uid)).size !== players.length) throw new WireValidationError('GAME_DEMO_BOSS_FIGHTER', 'battle.players');
    const events = v.events.map((input, index, all) => {
        const e = rpcRecord(input, 'event'); assertExactKeys(e, ['sequence', 'at', 'uid', 'kind', 'amount'], [], 'event');
        if (e.kind !== 'sword' && e.kind !== 'counter' && e.kind !== 'revive') throw new WireValidationError('GAME_DEMO_BOSS_EVENT', 'event.kind');
        const seq = finiteInteger(e.sequence, 'event.sequence', 1, sequence);
        if (index && seq <= (all[index - 1] as { sequence: number }).sequence) throw new WireValidationError('GAME_DEMO_BOSS_EVENT', 'event.sequence');
        return { sequence: seq, at: finiteInteger(e.at, 'event.at', 0), uid: boundedString(e.uid, 'event.uid', 1, 128), kind: e.kind as 'sword' | 'counter' | 'revive', amount: finiteInteger(e.amount, 'event.amount', 0) };
    });
    return { players, events, sequence, nextCounterAt: finiteInteger(v.nextCounterAt, 'battle.nextCounterAt', 0) };
}
export function validateGameDemoBossRoom(input: unknown): GameDemoBossRoom {
    const v = rpcRecord(input, 'room');
    assertExactKeys(v, ['bossId', 'name', 'runId', 'runNumber', 'hp', 'maxHp', 'phase', 'revision', 'ownerEpoch', 'respawnAt', 'damage'], ['battle'], 'room');
    if (v.phase !== 'running' && v.phase !== 'settling' && v.phase !== 'settled') throw new WireValidationError('GAME_DEMO_BOSS_PHASE', 'room.phase');
    const maxHp = finiteInteger(v.maxHp, 'room.maxHp', 1);
    const hp = finiteInteger(v.hp, 'room.hp', 0, maxHp);
    const respawnAt = finiteInteger(v.respawnAt, 'room.respawnAt', 0);
    if ((v.phase === 'running') !== (hp > 0) || (hp > 0 && respawnAt !== 0)) throw new WireValidationError('GAME_DEMO_BOSS_HP', 'room.hp');
    if (!Array.isArray(v.damage) || v.damage.length > GAME_DEMO_CONFIG.bossMaxParticipants) throw new WireValidationError('GAME_DEMO_BOSS_DAMAGE', 'room.damage');
    const damage = v.damage.map((input, index) => {
        const d = rpcRecord(input, 'damage'); assertExactKeys(d, ['uid', 'damage', 'rank'], [], 'damage');
        const rank = finiteInteger(d.rank, 'damage.rank', 1, GAME_DEMO_CONFIG.bossMaxParticipants);
        if (rank !== index + 1) throw new WireValidationError('GAME_DEMO_BOSS_RANK', 'damage.rank');
        return { uid: boundedString(d.uid, 'damage.uid', 1, 128), damage: finiteInteger(d.damage, 'damage.damage', 1, maxHp), rank };
    });
    if (new Set(damage.map(d => d.uid)).size !== damage.length || damage.reduce((sum, d) => sum + d.damage, 0) !== maxHp - hp || damage.some((d, i) => i > 0 && d.damage > damage[i - 1].damage)) throw new WireValidationError('GAME_DEMO_BOSS_TOTAL', 'room.damage');
    return { bossId: validateGameDemoBossId(v.bossId), name: boundedString(v.name, 'room.name', 1, 32), runId: boundedString(v.runId, 'room.runId', 1, 64),
        runNumber: finiteInteger(v.runNumber, 'room.runNumber', 1), hp, maxHp, phase: v.phase, revision: finiteInteger(v.revision, 'room.revision', 1), ownerEpoch: finiteInteger(v.ownerEpoch, 'room.ownerEpoch', 1), respawnAt, damage, ...(v.battle === undefined ? {} : { battle: validateGameDemoBossBattle(v.battle) }) };
}
export const validateGameDemoBossListRes: RuntimeValidator<IGameDemoBossListRes> = input => {
    const v = rpcRecord(input, 'response'); assertExactKeys(v, ['rooms', 'currentBossId', 'generation'], [], 'response');
    if (!Array.isArray(v.rooms) || v.rooms.length !== 3) throw new WireValidationError('GAME_DEMO_BOSS_ROOMS', 'response.rooms');
    const rooms = v.rooms.map(validateGameDemoBossRoom);
    if (new Set(rooms.map(r => r.bossId)).size !== 3) throw new WireValidationError('GAME_DEMO_BOSS_ROOMS', 'response.rooms');
    return { rooms, currentBossId: v.currentBossId === null ? null : validateGameDemoBossId(v.currentBossId), generation: finiteInteger(v.generation, 'response.generation', 0) };
};
export const validateGameDemoBossRes: RuntimeValidator<IGameDemoBossRes> = input => {
    const v = rpcRecord(input, 'response'); assertExactKeys(v, ['room', 'currentBossId', 'generation', 'serverNow', 'nextAttackAt', 'heroAttack', 'heroRevision', 'myDamage', 'appliedDamage'], ['uid'], 'response');
    return { ...(v.uid === undefined ? {} : { uid: boundedString(v.uid, 'response.uid', 1, 128) }), room: validateGameDemoBossRoom(v.room), currentBossId: v.currentBossId === null ? null : validateGameDemoBossId(v.currentBossId), generation: finiteInteger(v.generation, 'response.generation', 0),
        serverNow: finiteInteger(v.serverNow, 'response.serverNow', 0), nextAttackAt: finiteInteger(v.nextAttackAt, 'response.nextAttackAt', 0), heroAttack: finiteInteger(v.heroAttack, 'response.heroAttack', 1),
        heroRevision: finiteInteger(v.heroRevision, 'response.heroRevision', 0), myDamage: finiteInteger(v.myDamage, 'response.myDamage', 0), appliedDamage: finiteInteger(v.appliedDamage, 'response.appliedDamage', 0) };
};
export const validateGameDemoBossChanged: RuntimeValidator<GameDemoBossChanged> = input => {
    const v = rpcRecord(input, 'push.data'); assertExactKeys(v, ['bossId', 'runId', 'runNumber', 'revision', 'ownerEpoch', 'generation'], [], 'push.data');
    return { bossId: validateGameDemoBossId(v.bossId), runId: boundedString(v.runId, 'push.runId', 1, 64), runNumber: finiteInteger(v.runNumber, 'push.runNumber', 1),
        revision: finiteInteger(v.revision, 'push.revision', 1), ownerEpoch: finiteInteger(v.ownerEpoch, 'push.ownerEpoch', 1), generation: finiteInteger(v.generation, 'push.generation', 1) };
};
export default defineLobbyRpcDomain({
    domain: 'gameDemoBoss', contractVersion: 3,
    errorCodes: ['GAME_DEMO_BOSS_RECOVERING', 'GAME_DEMO_BOSS_STALE', 'GAME_DEMO_BOSS_COOLDOWN', 'GAME_DEMO_BOSS_ENDED', 'GAME_DEMO_BOSS_FULL', 'GAME_DEMO_BOSS_DEAD'],
    pushes: [defineLobbyPush('GameDemoBossChanged', 'gameDemoBoss.changed', validateGameDemoBossChanged)],
    routes: [
        defineRpcQuery(GameDemoBossRpc.List, { request: validateGameDemoBossListReq, response: validateGameDemoBossListRes }),
        defineRpcQuery(GameDemoBossRpc.Get, { request: validateGameDemoBossGetReq, response: validateGameDemoBossRes }),
        defineRpcIdempotentWrite(GameDemoBossRpc.Enter, { request: validateGameDemoBossEnterReq, response: validateGameDemoBossRes }),
        defineRpcIdempotentWrite(GameDemoBossRpc.Leave, { request: validateGameDemoBossLeaveReq, response: validateGameDemoBossListRes }),
        defineRpcIdempotentWrite(GameDemoBossRpc.Attack, { request: validateGameDemoBossAttackReq, response: validateGameDemoBossRes }),
    ],
});
