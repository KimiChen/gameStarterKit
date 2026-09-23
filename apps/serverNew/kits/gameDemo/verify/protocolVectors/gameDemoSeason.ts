import { GameDemoSeasonRpc } from '../../../../../shared/src/native/lobbyRpc/domains/gameDemoSeason';
import type { LobbyRpcVectorFile } from './types';
const result = { id: '1:1', phase: 'running' as const, startedAt: 1, endsAt: 600001, serverNow: 2, revision: 1, top: [], myScore: 0, myRank: null, deliveredRewards: 0, totalRewards: 0 };
export default {
    [GameDemoSeasonRpc.Get]: { request: {}, response: result },
    [GameDemoSeasonRpc.End]: { request: { clientReqId: 'end-one', seasonId: '1:1' }, response: { ...result, phase: 'settling' } },
} satisfies LobbyRpcVectorFile;
