import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from '../../../protocol/http';
import { defineLobbyRpcDomain, defineRpcQuery, defineRpcIdempotentWrite } from '../../../protocol/lobbyRpc/defineDomain';
import { emptyPayload, requiredId, rpcRecord } from '../../../protocol/lobbyRpc/primitives';
import { validateGameDemoAssetsRes } from './gameDemo';
import { GAME_DEMO_CONFIG } from '../../../kits/gameDemo/config';
import type { GameDemoAlchemyBatch, GameDemoAlchemyState } from '../../../kits/gameDemo/api/production/index';

export const GameDemoAlchemyRpc = { Get: 'gameDemoAlchemy.get', Start: 'gameDemoAlchemy.start', Finish: 'gameDemoAlchemy.finish' } as const;
export interface IGameDemoAlchemyGetReq { readonly [key: string]: never; }
export interface IGameDemoAlchemyStartReq { clientReqId: string; count: number; }
export interface IGameDemoAlchemyFinishReq { clientReqId: string; batchId: string; early: boolean; }
export type IGameDemoAlchemyRes = GameDemoAlchemyState;
export const validateGameDemoAlchemyGetReq: RuntimeValidator<IGameDemoAlchemyGetReq> = input => emptyPayload(input);
export const validateGameDemoAlchemyStartReq: RuntimeValidator<IGameDemoAlchemyStartReq> = input => {
    const value = rpcRecord(input); assertExactKeys(value, ['clientReqId', 'count'], [], 'payload');
    return { clientReqId: requiredId(value, 'clientReqId'), count: finiteInteger(value.count, 'payload.count', 1, GAME_DEMO_CONFIG.alchemy.maxBatch) };
};
export const validateGameDemoAlchemyFinishReq: RuntimeValidator<IGameDemoAlchemyFinishReq> = input => {
    const value = rpcRecord(input); assertExactKeys(value, ['clientReqId', 'batchId', 'early'], [], 'payload');
    if (typeof value.early !== 'boolean') throw new WireValidationError('GAME_DEMO_EARLY', 'payload.early');
    return { clientReqId: requiredId(value, 'clientReqId'), batchId: boundedString(value.batchId, 'payload.batchId', 1, 64), early: value.early };
};
export function validateGameDemoAlchemyBatch(input: unknown): GameDemoAlchemyBatch {
    const value = rpcRecord(input, 'batch');
    assertExactKeys(value, ['id', 'configVersion', 'count', 'startedAt', 'durationMs', 'endsAt', 'phase', 'completed', 'pill', 'finePill', 'refundedHerb', 'refundedDew', 'score'], [], 'batch');
    if (value.phase !== 'running' && value.phase !== 'claimed') throw new WireValidationError('GAME_DEMO_BATCH_PHASE', 'batch.phase');
    const count = finiteInteger(value.count, 'batch.count', 1, GAME_DEMO_CONFIG.alchemy.maxBatch);
    const startedAt = finiteInteger(value.startedAt, 'batch.startedAt', 0);
    const durationMs = finiteInteger(value.durationMs, 'batch.durationMs', 0);
    const endsAt = finiteInteger(value.endsAt, 'batch.endsAt', 0);
    const configVersion = finiteInteger(value.configVersion, 'batch.configVersion', 1);
    // v1–v3 persist per-unit timers; v4+ settles immediately on submission.
    if ((configVersion >= 4 ? durationMs !== 0 || value.phase !== 'claimed' : durationMs < 1) ||
        endsAt !== startedAt + durationMs * count) throw new WireValidationError('GAME_DEMO_BATCH_CLOCK', 'batch.endsAt');
    const completed = finiteInteger(value.completed, 'batch.completed', 0, count);
    if (configVersion >= 4 && completed !== count) throw new WireValidationError('GAME_DEMO_BATCH_OUTPUT', 'batch.completed');
    const pill = finiteInteger(value.pill, 'batch.pill', 0, count);
    const finePill = finiteInteger(value.finePill, 'batch.finePill', 0, count);
    if ((value.phase === 'running' && pill + finePill !== 0) || (value.phase === 'claimed' && pill + finePill !== completed))
        throw new WireValidationError('GAME_DEMO_BATCH_OUTPUT', 'batch');
    return { id: boundedString(value.id, 'batch.id', 1, 64), configVersion,
        count, startedAt, durationMs, endsAt, phase: value.phase, completed, pill, finePill,
        refundedHerb: finiteInteger(value.refundedHerb, 'batch.refundedHerb', 0), refundedDew: finiteInteger(value.refundedDew, 'batch.refundedDew', 0), score: finiteInteger(value.score, 'batch.score', 0) };
}
export const validateGameDemoAlchemyRes: RuntimeValidator<IGameDemoAlchemyRes> = input => {
    const value = rpcRecord(input, 'response');
    assertExactKeys(value, ['assets', 'revision', 'serverNow', 'batch'], [], 'response');
    return { assets: validateGameDemoAssetsRes(value.assets), revision: finiteInteger(value.revision, 'response.revision', 0),
        serverNow: finiteInteger(value.serverNow, 'response.serverNow', 0), batch: value.batch === null ? null : validateGameDemoAlchemyBatch(value.batch) };
};
export default defineLobbyRpcDomain({
    domain: 'gameDemoAlchemy', contractVersion: 1, errorCodes: ['GAME_DEMO_BATCH_RUNNING', 'GAME_DEMO_BATCH_NOT_FOUND', 'GAME_DEMO_BATCH_NOT_READY'], pushes: [],
    routes: [
        defineRpcQuery(GameDemoAlchemyRpc.Get, { request: validateGameDemoAlchemyGetReq, response: validateGameDemoAlchemyRes }),
        defineRpcIdempotentWrite(GameDemoAlchemyRpc.Start, { request: validateGameDemoAlchemyStartReq, response: validateGameDemoAlchemyRes }),
        defineRpcIdempotentWrite(GameDemoAlchemyRpc.Finish, { request: validateGameDemoAlchemyFinishReq, response: validateGameDemoAlchemyRes }),
    ],
});
