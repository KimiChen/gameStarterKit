import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from '../../../protocol/http';
import { defineLobbyRpcDomain, defineRpcQuery, defineRpcIdempotentWrite } from '../../../protocol/lobbyRpc/defineDomain';
import { emptyPayload, requiredId, rpcRecord } from '../../../protocol/lobbyRpc/primitives';
import type { GameDemoSeasonState } from '../../../kits/gameDemo/api/season/index';
export const GameDemoSeasonRpc = { Get: 'gameDemoSeason.get', End: 'gameDemoSeason.end' } as const;
export interface IGameDemoSeasonGetReq { readonly [key: string]: never; }
export interface IGameDemoSeasonEndReq { clientReqId: string; seasonId: string; }
export type IGameDemoSeasonRes = GameDemoSeasonState;
export const validateGameDemoSeasonGetReq: RuntimeValidator<IGameDemoSeasonGetReq> = input => emptyPayload(input);
export const validateGameDemoSeasonEndReq: RuntimeValidator<IGameDemoSeasonEndReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'seasonId'], [], 'payload');
    return { clientReqId: requiredId(v, 'clientReqId'), seasonId: boundedString(v.seasonId, 'payload.seasonId', 1, 64) };
};
export const validateGameDemoSeasonRes: RuntimeValidator<IGameDemoSeasonRes> = input => {
    const v = rpcRecord(input, 'response');
    assertExactKeys(v, ['id', 'phase', 'startedAt', 'endsAt', 'serverNow', 'revision', 'top', 'myScore', 'myRank', 'deliveredRewards', 'totalRewards'], [], 'response');
    if (v.phase !== 'running' && v.phase !== 'settling' && v.phase !== 'settled') throw new WireValidationError('GAME_DEMO_SEASON_PHASE', 'response.phase');
    if (!Array.isArray(v.top) || v.top.length > 20) throw new WireValidationError('GAME_DEMO_SEASON_TOP', 'response.top');
    const top = v.top.map((input, i) => {
        const row = rpcRecord(input, 'row'); assertExactKeys(row, ['uid', 'score', 'rank'], [], 'row');
        const rank = finiteInteger(row.rank, 'row.rank', 1, 20);
        if (rank !== i + 1) throw new WireValidationError('GAME_DEMO_SEASON_RANK', 'row.rank');
        return { uid: boundedString(row.uid, 'row.uid', 1, 128), score: finiteInteger(row.score, 'row.score', 1), rank };
    });
    if (new Set(top.map(row => row.uid)).size !== top.length || top.some((row, i) => i > 0 && row.score > top[i - 1].score))
        throw new WireValidationError('GAME_DEMO_SEASON_ORDER', 'response.top');
    const startedAt = finiteInteger(v.startedAt, 'response.startedAt', 0);
    const endsAt = finiteInteger(v.endsAt, 'response.endsAt', startedAt);
    const totalRewards = finiteInteger(v.totalRewards, 'response.totalRewards', 0, 3);
    const deliveredRewards = finiteInteger(v.deliveredRewards, 'response.deliveredRewards', 0, totalRewards);
    return { id: boundedString(v.id, 'response.id', 1, 64), phase: v.phase, startedAt, endsAt,
        serverNow: finiteInteger(v.serverNow, 'response.serverNow', 0), revision: finiteInteger(v.revision, 'response.revision', 1), top,
        myScore: finiteInteger(v.myScore, 'response.myScore', 0), myRank: v.myRank === null ? null : finiteInteger(v.myRank, 'response.myRank', 1, top.length), deliveredRewards, totalRewards };
};
export default defineLobbyRpcDomain({
    domain: 'gameDemoSeason', contractVersion: 1, errorCodes: ['GAME_DEMO_SEASON_CHANGED'], pushes: [],
    routes: [
        defineRpcQuery(GameDemoSeasonRpc.Get, { request: validateGameDemoSeasonGetReq, response: validateGameDemoSeasonRes }),
        defineRpcIdempotentWrite(GameDemoSeasonRpc.End, { request: validateGameDemoSeasonEndReq, response: validateGameDemoSeasonRes }),
    ],
});
