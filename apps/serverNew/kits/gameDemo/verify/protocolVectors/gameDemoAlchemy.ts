import { GameDemoAlchemyRpc } from '../../../../../shared/src/native/lobbyRpc/domains/gameDemoAlchemy';
import type { LobbyRpcVectorFile } from './types';
const result = { assets: { initialized: true, revision: 1, gold: 5000, items: { herb: 0, dew: 0, pill: 0, finePill: 0 } }, revision: 0, serverNow: 1, batch: null };
export default {
    [GameDemoAlchemyRpc.Get]: { request: {}, response: result },
    [GameDemoAlchemyRpc.Start]: { request: { clientReqId: 'start-one', count: 1 }, response: result },
    [GameDemoAlchemyRpc.Finish]: { request: { clientReqId: 'finish-one', batchId: 'batch-one', early: false }, response: result },
} satisfies LobbyRpcVectorFile;
